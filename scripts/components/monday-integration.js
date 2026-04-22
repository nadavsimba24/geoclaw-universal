#!/usr/bin/env node
// Real Monday.com GraphQL integration for Geoclaw

const https = require('https');

const MONDAY_ENDPOINT = 'https://api.monday.com/v2';

// ── Low-level GraphQL call ────────────────────────────────────────────────────

function mondayRequest(query, variables = {}) {
  const token = process.env.GEOCLAW_MONDAY_API_TOKEN;
  if (!token) {
    return Promise.reject(new Error(
      'GEOCLAW_MONDAY_API_TOKEN is not set. Run: geoclaw setup'
    ));
  }

  const body = JSON.stringify({ query, variables });

  return new Promise((resolve, reject) => {
    const req = https.request(MONDAY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
        'API-Version': '2024-10',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.errors) {
            return reject(new Error(
              'Monday API error: ' + JSON.stringify(parsed.errors)
            ));
          }
          resolve(parsed.data);
        } catch (e) {
          reject(new Error(`Monday API returned invalid JSON: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── High-level operations ─────────────────────────────────────────────────────

async function testAuth() {
  const data = await mondayRequest('{ me { id name email } }');
  return data.me;
}

async function listBoards(limit = 25) {
  const data = await mondayRequest(
    `{ boards(limit: ${limit}) { id name description items_count } }`
  );
  return data.boards;
}

async function getBoard(boardId) {
  const id = String(boardId);
  const data = await mondayRequest(`
    {
      boards(ids: [${id}]) {
        id
        name
        description
        columns { id title type }
        items_page(limit: 100) {
          items {
            id
            name
            column_values { id text value }
          }
        }
      }
    }
  `);
  return data.boards[0];
}

async function createItem(boardId, itemName, columnValues = null) {
  const id = String(boardId);
  const name = itemName.replace(/"/g, '\\"');
  const cv = columnValues
    ? `, column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"`
    : '';
  const data = await mondayRequest(`
    mutation {
      create_item(board_id: ${id}, item_name: "${name}"${cv}) {
        id
        name
      }
    }
  `);
  return data.create_item;
}

async function updateColumn(boardId, itemId, columnId, value) {
  const bid = String(boardId);
  const iid = String(itemId);
  const cid = columnId.replace(/"/g, '\\"');
  const val = String(value).replace(/"/g, '\\"');
  const data = await mondayRequest(`
    mutation {
      change_simple_column_value(
        board_id: ${bid},
        item_id: ${iid},
        column_id: "${cid}",
        value: "${val}"
      ) { id }
    }
  `);
  return data.change_simple_column_value;
}

async function postUpdate(itemId, body) {
  const iid = String(itemId);
  const text = body.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  const data = await mondayRequest(`
    mutation {
      create_update(item_id: ${iid}, body: "${text}") {
        id
        body
      }
    }
  `);
  return data.create_update;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  require('dotenv').config({
    path: require('path').join(
      process.env.GEOCLAW_DIR || __dirname + '/../..',
      '.env'
    ),
  });

  const [sub, ...args] = process.argv.slice(2);

  try {
    switch (sub) {
      case 'test': {
        const me = await testAuth();
        console.log(`✅ Authenticated as: ${me.name} (${me.email})`);
        console.log(`   User ID: ${me.id}`);
        break;
      }

      case 'boards': {
        const boards = await listBoards();
        console.log(`\n📋 Found ${boards.length} board(s):\n`);
        for (const b of boards) {
          console.log(`  • ${b.name}`);
          console.log(`    ID: ${b.id}   Items: ${b.items_count}`);
          if (b.description) console.log(`    ${b.description}`);
          console.log('');
        }
        break;
      }

      case 'board': {
        const boardId = args[0] || process.env.GEOCLAW_MONDAY_DEFAULT_BOARD_ID;
        if (!boardId) {
          console.error('Usage: geoclaw monday board <id>');
          process.exit(1);
        }
        const board = await getBoard(boardId);
        if (!board) {
          console.error(`Board ${boardId} not found`);
          process.exit(1);
        }
        console.log(`\n📋 ${board.name} (${board.id})`);
        if (board.description) console.log(`   ${board.description}`);
        console.log(`\n   Columns: ${board.columns.map(c => `${c.title}(${c.id})`).join(', ')}`);
        console.log(`\n   Items (${board.items_page.items.length}):`);
        for (const it of board.items_page.items) {
          console.log(`     • [${it.id}] ${it.name}`);
        }
        console.log('');
        break;
      }

      case 'create': {
        const boardId = args[0] === '--board' ? args[1] : process.env.GEOCLAW_MONDAY_DEFAULT_BOARD_ID;
        const name = args[0] === '--board' ? args.slice(2).join(' ') : args.join(' ');
        if (!boardId || !name) {
          console.error('Usage: geoclaw monday create [--board <id>] <item name>');
          process.exit(1);
        }
        const item = await createItem(boardId, name);
        console.log(`✅ Created item: "${item.name}" (ID: ${item.id}) on board ${boardId}`);
        break;
      }

      case 'update': {
        const [itemId, columnId, ...valParts] = args;
        const boardId = process.env.GEOCLAW_MONDAY_DEFAULT_BOARD_ID;
        const value = valParts.join(' ');
        if (!itemId || !columnId || !value || !boardId) {
          console.error('Usage: geoclaw monday update <item_id> <column_id> <value>');
          console.error('(Requires GEOCLAW_MONDAY_DEFAULT_BOARD_ID in .env)');
          process.exit(1);
        }
        await updateColumn(boardId, itemId, columnId, value);
        console.log(`✅ Updated item ${itemId}: ${columnId} = "${value}"`);
        break;
      }

      case 'comment': {
        const [itemId, ...bodyParts] = args;
        const body = bodyParts.join(' ');
        if (!itemId || !body) {
          console.error('Usage: geoclaw monday comment <item_id> <text>');
          process.exit(1);
        }
        const update = await postUpdate(itemId, body);
        console.log(`✅ Posted comment on item ${itemId} (update ID: ${update.id})`);
        break;
      }

      default:
        console.log(`
Usage: geoclaw monday <subcommand> [args]

Subcommands:
  test                           Verify API token works
  boards                         List all your boards
  board [id]                     Show items on a board (uses default if no id)
  create [--board <id>] <name>   Create an item
  update <item_id> <col> <val>   Change a column value
  comment <item_id> <text>       Post an update/comment on an item

Env vars (set by 'geoclaw setup'):
  GEOCLAW_MONDAY_API_TOKEN          Personal API token
  GEOCLAW_MONDAY_DEFAULT_BOARD_ID   Default board for commands without --board
`);
    }
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  mondayRequest,
  testAuth,
  listBoards,
  getBoard,
  createItem,
  updateColumn,
  postUpdate,
};

if (require.main === module) main();
