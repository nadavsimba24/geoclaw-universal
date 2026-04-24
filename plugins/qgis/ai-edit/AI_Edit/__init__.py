# -*- coding: utf-8 -*-

def classFactory(iface):
    from .ai_edit_plugin import AIEditPlugin
    return AIEditPlugin(iface)
