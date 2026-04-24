# -*- coding: utf-8 -*-
"""
AI Edit QGIS Plugin - Powered by Nano Banana 2 (Google Gemini)
===============================================================
Select a region on your map, describe the change with natural language,
and get a georeferenced result.

Based on: https://terra-lab.ai/ai-edit
Uses Nano Banana 2 CLI: github.com/kingbootoshi/nano-banana-2-skill
"""

import os
import json
import tempfile
import subprocess
import math
from pathlib import Path

from qgis.PyQt.QtCore import (
    QSettings, QTranslator, qVersion, QCoreApplication,
    Qt, QUrl, QThread, pyqtSignal, QTimer
)
from qgis.PyQt.QtGui import QAction, QIcon, QPixmap, QColor
from qgis.PyQt.QtWidgets import (
    QActionGroup, QMessageBox, QDockWidget,
    QPushButton, QTextEdit, QLabel, QVBoxLayout,
    QWidget, QProgressBar, QComboBox, QGroupBox,
    QHBoxLayout, QSpinBox, QFileDialog, QSplitter,
    QFrame, QSlider, QCheckBox
)
from qgis.core import (
    QgsProject, QgsRasterLayer, QgsMapLayer,
    QgsRectangle, QgsCoordinateTransform,
    QgsCoordinateReferenceSystem, QgsRasterFileWriter,
    QgsRasterPipe, QgsPointXY, QgsGeometry,
    QgsVectorLayer, QgsFeature, QgsField,
    QgsMessageLog, QgsApplication
)
from qgis.gui import (
    QgsMapToolEmitPoint, QgsRubberBand, QgsMapTool,
    QgsMapMouseEvent, QgsVertexMarker
)


class NanoBananaWorker(QThread):
    """Background worker to run Nano Banana CLI without freezing QGIS"""
    
    finished = pyqtSignal(str)
    error = pyqtSignal(str)
    progress = pyqtSignal(int)
    
    def __init__(self, prompt, image_path, output_path, api_key=None):
        super().__init__()
        self.prompt = prompt
        self.image_path = image_path
        self.output_path = output_path
        self.api_key = api_key
    
    def run(self):
        try:
            # Build the nano-banana command
            cmd = ["nano-banana", self.prompt]
            
            if self.image_path:
                cmd.extend(["--ref", self.image_path])
            
            if self.output_path:
                cmd.extend(["--output", self.output_path])
            
            cmd.extend(["--size", "2K"])
            
            # Set API key if provided
            env = os.environ.copy()
            if self.api_key:
                env["GEMINI_API_KEY"] = self.api_key
            
            # Run the CLI
            self.progress.emit(25)
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=120, env=env
            )
            self.progress.emit(75)
            
            if result.returncode != 0:
                self.error.emit(f"Nano Banana error: {result.stderr}")
                return
            
            # Extract output path from CLI output
            output_line = None
            for line in result.stdout.split("\n"):
                if "saved" in line.lower() or "output" in line.lower():
                    output_line = line.strip()
                    break
            
            self.progress.emit(100)
            self.finished.emit(result.stdout)
            
        except subprocess.TimeoutExpired:
            self.error.emit("Nano Banana timed out (120s). Try a smaller region.")
        except FileNotFoundError:
            self.error.emit(
                "Nano Banana CLI not found. Install: npm install -g nano-banana-2"
            )
        except Exception as e:
            self.error.emit(f"Error: {str(e)}")


class RectangleMapTool(QgsMapTool):
    """Map tool for drawing a rectangle selection on the map canvas"""
    
    rectangle_created = pyqtSignal(QgsRectangle)
    
    def __init__(self, canvas):
        super().__init__(canvas)
        self.canvas = canvas
        self.rubber_band = QgsRubberBand(canvas, QgsRubberBand.Polygon)
        self.rubber_band.setColor(QColor(255, 0, 0, 100))
        self.rubber_band.setWidth(2)
        self.reset()
    
    def reset(self):
        self.start_point = None
        self.end_point = None
        self.is_emitting_point = False
        self.rubber_band.reset()
    
    def canvasPressEvent(self, e):
        self.start_point = self.toMapCoordinates(e.pos())
        self.end_point = self.start_point
        self.is_emitting_point = True
        self.rubber_band.reset()
        self.rubber_band.addPoint(self.start_point)
        self.rubber_band.addPoint(self.start_point)
    
    def canvasMoveEvent(self, e):
        if not self.is_emitting_point:
            return
        
        self.end_point = self.toMapCoordinates(e.pos())
        self.rubber_band.reset()
        self.rubber_band.addPoint(self.start_point)
        self.rubber_band.addPoint(
            QgsPointXY(self.end_point.x(), self.start_point.y())
        )
        self.rubber_band.addPoint(self.end_point)
        self.rubber_band.addPoint(
            QgsPointXY(self.start_point.x(), self.end_point.y())
        )
        self.rubber_band.addPoint(self.start_point)
    
    def canvasReleaseEvent(self, e):
        self.is_emitting_point = False
        
        if self.start_point and self.end_point:
            rect = QgsRectangle(self.start_point, self.end_point)
            if not rect.isNull():
                self.rectangle_created.emit(rect)
        
        self.reset()
    
    def deactivate(self):
        self.reset()
        super().deactivate()


class AIEditPlugin:
    """AI Edit QGIS Plugin"""
    
    def __init__(self, iface):
        self.iface = iface
        self.plugin_dir = Path(__file__).parent
        self.actions = []
        self.menu = "AI Edit"
        self.toolbar = None
        self.dock_widget = None
        self.rect_tool = None
        self.selected_extent = None
        self.api_key = None
        self.worker = None
    
    def initGui(self):
        """Initialize the plugin GUI"""
        self._create_dock_widget()
        self._add_toolbar_action()
    
    def _create_dock_widget(self):
        """Create the AI Edit dock widget panel"""
        self.dock_widget = QDockWidget("AI Edit (Nano Banana 2)")
        self.dock_widget.setObjectName("AIEditDockWidget")
        
        widget = QWidget()
        layout = QVBoxLayout()
        
        # Title
        title = QLabel("<h2>🧠 AI Edit</h2>")
        title.setAlignment(Qt.AlignCenter)
        layout.addWidget(title)
        
        subtitle = QLabel("Powered by Google's Nano Banana 2")
        subtitle.setAlignment(Qt.AlignCenter)
        subtitle.setStyleSheet("color: gray; font-size: 10px;")
        layout.addWidget(subtitle)
        
        layout.addWidget(self._create_separator())
        
        # API Key section
        api_group = QGroupBox("🔑 API Configuration")
        api_layout = QVBoxLayout()
        
        key_row = QHBoxLayout()
        api_key_input = QComboBox()
        api_key_input.setEditable(True)
        api_key_input.setPlaceholderText("GEMINI_API_KEY (or leave blank for env var)")
        api_key_input.addItems([
            "",  # Use env var
            os.environ.get("GEMINI_API_KEY", "")[:20] + "..." if os.environ.get("GEMINI_API_KEY") else "",
        ])
        key_row.addWidget(QLabel("API Key:"))
        key_row.addWidget(api_key_input)
        api_layout.addLayout(key_row)
        
        self.api_key_combo = api_key_input
        
        api_group.setLayout(api_layout)
        layout.addWidget(api_group)
        
        # Selection section
        sel_group = QGroupBox("🎯 Selection")
        sel_layout = QVBoxLayout()
        
        sel_btn = QPushButton("✏️ Select Area on Map")
        sel_btn.setStyleSheet(
            "background-color: #4CAF50; color: white; font-weight: bold; "
            "padding: 10px; border-radius: 5px;"
        )
        sel_btn.clicked.connect(self._start_rectangle_selection)
        sel_layout.addWidget(sel_btn)
        
        self.extent_label = QLabel("No area selected")
        self.extent_label.setStyleSheet("color: orange; font-style: italic;")
        sel_layout.addWidget(self.extent_label)
        
        # Layer selection
        layer_row = QHBoxLayout()
        layer_row.addWidget(QLabel("Source layer:"))
        self.layer_combo = QComboBox()
        layer_row.addWidget(self.layer_combo)
        sel_layout.addLayout(layer_row)
        
        sel_group.setLayout(sel_layout)
        layout.addWidget(sel_group)
        
        layout.addWidget(self._create_separator())
        
        # Prompt section
        prompt_group = QGroupBox("💬 Describe the Change")
        prompt_layout = QVBoxLayout()
        
        examples = QLabel(
            "<i>Examples:</i><br>"
            "• Replace buildings with green trees<br>"
            "• Remove cars from parking lot<br>"
            "• Change field color to dry grass<br>"
            "• Add three new buildings in empty lot"
        )
        examples.setWordWrap(True)
        examples.setStyleSheet("color: #666; padding: 5px;")
        prompt_layout.addWidget(examples)
        
        self.prompt_input = QTextEdit()
        self.prompt_input.setPlaceholderText(
            "Describe what you want to change in the selected area..."
        )
        self.prompt_input.setMaximumHeight(80)
        prompt_layout.addWidget(self.prompt_input)
        
        prompt_group.setLayout(prompt_layout)
        layout.addWidget(prompt_group)
        
        layout.addWidget(self._create_separator())
        
        # Options section
        opts_group = QGroupBox("⚙️ Options")
        opts_layout = QVBoxLayout()
        
        res_row = QHBoxLayout()
        res_row.addWidget(QLabel("Resolution:"))
        self.res_combo = QComboBox()
        self.res_combo.addItems(["512", "1K", "2K", "4K"])
        self.res_combo.setCurrentText("2K")
        res_row.addWidget(self.res_combo)
        res_row.addStretch()
        opts_layout.addLayout(res_row)
        
        self.keep_geo_cb = QCheckBox("✅ Keep georeferenced output")
        self.keep_geo_cb.setChecked(True)
        opts_layout.addWidget(self.keep_geo_cb)
        
        self.add_to_map_cb = QCheckBox("🗺️ Add result as new layer")
        self.add_to_map_cb.setChecked(True)
        opts_layout.addWidget(self.add_to_map_cb)
        
        opts_group.setLayout(opts_layout)
        layout.addWidget(opts_group)
        
        layout.addWidget(self._create_separator())
        
        # Progress
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)
        
        self.status_label = QLabel("Ready")
        self.status_label.setAlignment(Qt.AlignCenter)
        self.status_label.setStyleSheet("color: gray;")
        layout.addWidget(self.status_label)
        
        # Generate button
        self.generate_btn = QPushButton("🚀 Generate AI Edit")
        self.generate_btn.setStyleSheet(
            "background-color: #FF6B35; color: white; font-weight: bold; "
            "padding: 12px; border-radius: 5px; font-size: 14px;"
        )
        self.generate_btn.clicked.connect(self._generate_ai_edit)
        layout.addWidget(self.generate_btn)
        
        # Output section
        self.output_text = QTextEdit()
        self.output_text.setReadOnly(True)
        self.output_text.setMaximumHeight(100)
        self.output_text.setPlaceholderText("Output will appear here...")
        layout.addWidget(self.output_text)
        
        layout.addStretch()
        widget.setLayout(layout)
        
        self.dock_widget.setWidget(widget)
        self.iface.addDockWidget(Qt.RightDockWidgetArea, self.dock_widget)
        
        # Connect to layer changes
        self.iface.mapCanvas().layersChanged.connect(self._refresh_layers)
        self._refresh_layers()
    
    def _create_separator(self):
        line = QFrame()
        line.setFrameShape(QFrame.HLine)
        line.setFrameShadow(QFrame.Sunken)
        return line
    
    def _add_toolbar_action(self):
        """Add toolbar icon and menu entry"""
        icon_path = str(self.plugin_dir / "icon.png")
        if not os.path.exists(icon_path):
            # Create a simple icon
            pixmap = QPixmap(64, 64)
            pixmap.fill(QColor(255, 107, 53))
            pixmap.save(icon_path)
        
        action = QAction(QIcon(icon_path), "AI Edit", self.iface.mainWindow())
        action.triggered.connect(self._toggle_dock)
        action.setCheckable(True)
        action.setChecked(True)
        
        self.iface.addToolBarIcon(action)
        self.iface.addPluginToMenu(self.menu, action)
        self.actions.append(action)
    
    def _toggle_dock(self):
        """Toggle the dock widget visibility"""
        self.dock_widget.setVisible(not self.dock_widget.isVisible())
    
    def _refresh_layers(self):
        """Refresh the layer combo box"""
        self.layer_combo.clear()
        for layer in QgsProject.instance().mapLayers().values():
            if isinstance(layer, QgsRasterLayer):
                self.layer_combo.addItem(layer.name(), layer.id())
    
    def _start_rectangle_selection(self):
        """Activate the rectangle selection tool on the map"""
        canvas = self.iface.mapCanvas()
        self.rect_tool = RectangleMapTool(canvas)
        self.rect_tool.rectangle_created.connect(self._on_rectangle_created)
        canvas.setMapTool(self.rect_tool)
        self.status_label.setText("✏️ Click and drag to select area on map")
        self.status_label.setStyleSheet("color: green; font-weight: bold;")
    
    def _on_rectangle_created(self, rect: QgsRectangle):
        """Handle rectangle selection completion"""
        self.selected_extent = rect
        
        # Format the extent
        canvas = self.iface.mapCanvas()
        crs = canvas.mapSettings().destinationCrs()
        auth_id = crs.authid() if crs else "Unknown"
        
        width = rect.width()
        height = rect.height()
        
        self.extent_label.setText(
            f"✅ Selected: {rect.xMinimum():.2f}, {rect.yMinimum():.2f} → "
            f"{rect.xMaximum():.2f}, {rect.yMaximum():.2f}\n"
            f"Size: {abs(width):.1f} × {abs(height):.1f} ({auth_id})"
        )
        self.extent_label.setStyleSheet("color: green; font-weight: bold;")
        
        self.status_label.setText("Ready - area selected!")
        self.status_label.setStyleSheet("color: green;")
        
        # Auto-populate the prompt
        self.prompt_input.setFocus()
    
    def _get_api_key(self):
        """Get API key from UI or environment"""
        text = self.api_key_combo.currentText().strip()
        if text and not text.endswith("..."):
            return text
        return os.environ.get("GEMINI_API_KEY", None)
    
    def _generate_ai_edit(self):
        """Generate AI edit on the selected area"""
        prompt = self.prompt_input.toPlainText().strip()
        if not prompt:
            QMessageBox.warning(
                None, "Missing Prompt",
                "Please describe what you want to change."
            )
            return
        
        if not self.selected_extent:
            QMessageBox.warning(
                None, "No Area Selected",
                "Please select an area on the map first."
            )
            return
        
        api_key = self._get_api_key()
        if not api_key:
            QMessageBox.warning(
                None, "Missing API Key",
                "Set GEMINI_API_KEY environment variable or paste it above."
            )
            return
        
        # Set up progress
        self.generate_btn.setEnabled(False)
        self.progress_bar.setVisible(True)
        self.progress_bar.setValue(10)
        self.status_label.setText("🧠 Thinking...")
        self.status_label.setStyleSheet("color: blue; font-weight: bold;")
        
        # Capture the selected extent as an image
        canvas = self.iface.mapCanvas()
        extent = self.selected_extent
        
        # Save the map canvas view as image
        temp_dir = tempfile.mkdtemp()
        capture_path = os.path.join(temp_dir, "selection.png")
        output_path = os.path.join(temp_dir, "ai_edit_result.png")
        
        # Capture the canvas
        canvas.saveAsImage(capture_path, QSize(2048, 2048))
        
        # Run Nano Banana in background
        self.worker = NanoBananaWorker(prompt, capture_path, output_path, api_key)
        self.worker.finished.connect(
            lambda out: self._on_generation_done(output_path, out)
        )
        self.worker.error.connect(self._on_generation_error)
        self.worker.progress.connect(self.progress_bar.setValue)
        self.worker.start()
    
    def _on_generation_done(self, output_path: str, cli_output: str):
        """Handle successful generation"""
        self.progress_bar.setValue(100)
        self.status_label.setText("✅ Done!")
        self.status_label.setStyleSheet("color: green; font-weight: bold;")
        
        self.output_text.setPlainText(cli_output)
        
        # Load result as raster layer if checkbox is checked
        if self.add_to_map_cb.isChecked() and os.path.exists(output_path):
            layer = QgsRasterLayer(output_path, "AI Edit Result")
            if layer.isValid():
                QgsProject.instance().addMapLayer(layer)
                
                # Set georeferencing if keep_geo is checked
                if self.keep_geo_cb.isChecked():
                    self._georeference_layer(layer)
            else:
                self.output_text.append("\n⚠️ Could not load result as raster.")
        
        self.generate_btn.setEnabled(True)
        QMessageBox.information(None, "AI Edit Complete", "✅ Done! Check the result.")
    
    def _on_generation_error(self, error_msg: str):
        """Handle generation error"""
        self.progress_bar.setVisible(False)
        self.status_label.setText("❌ Error")
        self.status_label.setStyleSheet("color: red; font-weight: bold;")
        self.output_text.setPlainText(f"Error: {error_msg}")
        self.generate_btn.setEnabled(True)
        QMessageBox.critical(None, "AI Edit Error", error_msg)
    
    def _georeference_layer(self, layer: QgsRasterLayer):
        """Apply georeferencing to the result layer"""
        if not self.selected_extent:
            return
        
        canvas = self.iface.mapCanvas()
        crs = canvas.mapSettings().destinationCrs()
        layer.setCrs(crs)
        
        # The extent should already be correct from the capture
        layer.setExtent(self.selected_extent)
        
        self.output_text.append(
            f"\n✅ Georeferenced with CRS: {crs.authid()}"
        )
    
    def unload(self):
        """Clean up when plugin is unloaded"""
        for action in self.actions:
            self.iface.removePluginMenu(self.menu, action)
            self.iface.removeToolBarIcon(action)
        
        if self.dock_widget:
            self.iface.removeDockWidget(self.dock_widget)
            self.dock_widget = None
        
        if self.rect_tool:
            self.rect_tool = None
