# Salesforce Integration Guide for Geoclaw

## Overview
Salesforce integration enables Geoclaw to interact with Salesforce CRM data, including Accounts, Contacts, Opportunities, Cases, and custom objects. This allows for CRM automation, customer support, sales tracking, and business intelligence directly from chat interfaces.

## Features
- **CRM Operations**: Create, read, update, delete Salesforce records
- **SOQL Queries**: Execute Salesforce Object Query Language queries
- **Reports & Dashboards**: Access Salesforce reports and analytics
- **Workflow Automation**: Trigger Salesforce flows and processes
- **Chatter Integration**: Post to Chatter feeds and groups
- **Custom Objects**: Support for custom Salesforce objects

## Prerequisites
- Salesforce account with API access enabled
- Connected App configured in Salesforce
- API credentials (Consumer Key, Consumer Secret, Access Token)
- Appropriate user permissions

## Authentication Methods

### 1. OAuth 2.0 (Recommended)
**Best for:** Production environments, user-specific access

#### Create Connected App
1. In Salesforce: **Setup** → **App Manager** → **New Connected App**
2. Fill in:
   - **Connected App Name**: Geoclaw Integration
   - **API Name**: Geoclaw_Integration
   - **Contact Email**: Your email
3. Enable OAuth Settings:
   - **Enable OAuth Settings**: Checked
   - **Callback URL**: `https://localhost:8080/oauth/callback` (or your server)
   - **Selected OAuth Scopes**:
     - `Access and manage your data (api)`
     - `Perform requests on your behalf at any time (refresh_token, offline_access)`
     - `Provide access to your data via the Web (web)`
4. Save → Copy **Consumer Key** and **Consumer Secret**

#### Environment Variables
```bash
# Salesforce OAuth Configuration
GEOCLAW_SALESFORCE_ENABLED=false
GEOCLAW_SALESFORCE_CONSUMER_KEY=
GEOCLAW_SALESFORCE_CONSUMER_SECRET=
GEOCLAW_SALESFORCE_USERNAME=
GEOCLAW_SALESFORCE_PASSWORD=
GEOCLAW_SALESFORCE_SECURITY_TOKEN=
GEOCLAW_SALESFORCE_LOGIN_URL=https://login.salesforce.com
GEOCLAW_SALESFORCE_INSTANCE_URL=
GEOCLAW_SALESFORCE_ACCESS_TOKEN=
GEOCLAW_SALESFORCE_REFRESH_TOKEN=
```

### 2. Username-Password Flow (Development)
**Best for:** Development, server-to-server without user interaction

```javascript
// Get access token
const authResponse = await fetch('https://login.salesforce.com/services/oauth2/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'password',
    client_id: consumerKey,
    client_secret: consumerSecret,
    username: username,
    password: password + securityToken
  })
});
```

### 3. JWT Bearer Flow (Enterprise)
**Best for:** Server-to-server with service accounts

## Salesforce API Basics

### REST API Endpoints
```bash
# Base URL
https://your-instance.salesforce.com/services/data/v58.0/

# Common endpoints
/sobjects/Account/                  # Account operations
/sobjects/Contact/                  # Contact operations  
/sobjects/Opportunity/              # Opportunity operations
/sobjects/Case/                     # Case operations
/query/?q=SOQL_QUERY                # SOQL queries
/search/?q=SOSL_QUERY               # SOSL search
/composite/                         # Composite requests
```

### SOQL (Salesforce Object Query Language)
```sql
-- Basic query
SELECT Id, Name, Phone, Industry FROM Account LIMIT 10

-- With conditions
SELECT Id, Name, Amount, StageName FROM Opportunity 
WHERE StageName = 'Closed Won' AND CreatedDate = LAST_N_DAYS:30

-- Related objects
SELECT Id, Name, 
  (SELECT Id, FirstName, LastName, Email FROM Contacts) 
FROM Account 
WHERE Industry = 'Technology'

-- Aggregate queries
SELECT COUNT(Id), Industry FROM Account GROUP BY Industry
```

## Skill Implementation

### 1. Salesforce Skill Structure
Create `skills/salesforce/` with:
```
skills/salesforce/
├── SKILL.md
├── salesforce-client.js
├── salesforce-commands.js
├── soql-parser.js
└── references/
    ├── salesforce-api.md
    └── soql-reference.md
```

### 2. Salesforce Client Class
```javascript
// salesforce-client.js
class SalesforceClient {
  constructor(config) {
    this.instanceUrl = config.instanceUrl;
    this.accessToken = config.accessToken;
    this.apiVersion = config.apiVersion || 'v58.0';
    this.headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  async request(method, endpoint, data = null) {
    const url = `${this.instanceUrl}/services/data/${this.apiVersion}${endpoint}`;
    const options = {
      method,
      headers: this.headers
    };
    
    if (data) {
      options.body = JSON.stringify(data);
    }
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Salesforce API error: ${error}`);
    }
    
    return response.json();
  }

  // CRUD Operations
  async createRecord(objectType, record) {
    return this.request('POST', `/sobjects/${objectType}/`, record);
  }

  async getRecord(objectType, recordId, fields = null) {
    const fieldList = fields ? `?fields=${fields.join(',')}` : '';
    return this.request('GET', `/sobjects/${objectType}/${recordId}${fieldList}`);
  }

  async updateRecord(objectType, recordId, updates) {
    return this.request('PATCH', `/sobjects/${objectType}/${recordId}`, updates);
  }

  async deleteRecord(objectType, recordId) {
    return this.request('DELETE', `/sobjects/${objectType}/${recordId}`);
  }

  // Query Operations
  async query(soql) {
    const encodedQuery = encodeURIComponent(soql);
    return this.request('GET', `/query/?q=${encodedQuery}`);
  }

  async search(sosl) {
    const encodedSearch = encodeURIComponent(sosl);
    return this.request('GET', `/search/?q=${encodedSearch}`);
  }

  // Describe operations
  async describeObject(objectType) {
    return this.request('GET', `/sobjects/${objectType}/describe`);
  }

  async getLimits() {
    return this.request('GET', '/limits/');
  }
}
```

### 3. Command Handlers
```javascript
// salesforce-commands.js
const SalesforceCommands = {
  async searchAccounts(client, searchTerm) {
    const soql = `
      SELECT Id, Name, Phone, Industry, AnnualRevenue 
      FROM Account 
      WHERE Name LIKE '%${searchTerm}%' 
      ORDER BY Name 
      LIMIT 10
    `;
    
    const result = await client.query(soql);
    return result.records;
  },

  async createContact(client, firstName, lastName, email, accountId = null) {
    const contact = {
      FirstName: firstName,
      LastName: lastName,
      Email: email,
      AccountId: accountId
    };
    
    const result = await client.createRecord('Contact', contact);
    return `Contact created with ID: ${result.id}`;
  },

  async getOpportunityPipeline(client) {
    const soql = `
      SELECT StageName, COUNT(Id), SUM(Amount) 
      FROM Opportunity 
      WHERE IsClosed = false 
      GROUP BY StageName 
      ORDER BY StageName
    `;
    
    const result = await client.query(soql);
    return result.records;
  },

  async postToChatter(client, text, subjectId = null) {
    const feedItem = {
      body: {
        messageSegments: [{
          type: 'Text',
          text: text
        }]
      },
      subjectId: subjectId
    };
    
    return client.request('POST', '/chatter/feed-items', feedItem);
  },

  async getRecentCases(client, status = 'New', limit = 5) {
    const soql = `
      SELECT CaseNumber, Subject, Status, Priority, CreatedDate 
      FROM Case 
      WHERE Status = '${status}' 
      ORDER BY CreatedDate DESC 
      LIMIT ${limit}
    `;
    
    const result = await client.query(soql);
    return result.records;
  }
};
```

## Chat Commands Examples

### Natural Language Interface
```
@geoclaw Find account "Acme Corporation"
@geoclaw Create contact John Doe john@example.com for Acme account
@geoclaw What's our sales pipeline look like?
@geoclaw Show recent high priority cases
@geoclaw Update opportunity 006xx000001 to "Closed Won"
@geoclaw Post to chatter "Weekly team meeting at 2 PM"
```

### Structured Commands
```
/sf search account "Tech Startup"
/sf create contact --first "Jane" --last "Smith" --email "jane@example.com"
/sf query "SELECT Name, StageName FROM Opportunity WHERE IsClosed = false"
/sf report pipeline
/sf case list --status "New" --limit 10
/sf chatter post "Project milestone achieved!" --subject 001xx000003
```

## Webhook Integration (Outbound Messages)

### 1. Configure Outbound Message in Salesforce
1. In Salesforce: **Setup** → **Process Automation** → **Workflow Rules**
2. Create workflow rule on object (e.g., Case)
3. Add **Outbound Message** action
4. Set endpoint: `https://your-geoclaw-server.com/webhooks/salesforce`
5. Select fields to send
6. Set security token → `GEOCLAW_SALESFORCE_WEBHOOK_TOKEN`

### 2. Webhook Handler
```javascript
// webhooks/salesforce.js
const crypto = require('crypto');

function verifySalesforceWebhook(req, expectedToken) {
  const providedToken = req.headers['x-salesforce-webhook-token'];
  return providedToken === expectedToken;
}

async function handleSalesforceWebhook(req, geoclaw) {
  const { action, object, record } = req.body;
  
  switch (action) {
    case 'created':
      await handleRecordCreated(record, object, geoclaw);
      break;
      
    case 'updated':
      await handleRecordUpdated(record, object, geoclaw);
      break;
      
    case 'deleted':
      await handleRecordDeleted(record, object, geoclaw);
      break;
  }
}

async function handleRecordCreated(record, objectType, geoclaw) {
  let message = `New ${objectType} created: ${record.Name || record.Id}`;
  
  // Custom handling per object type
  switch (objectType) {
    case 'Case':
      message += `\nPriority: ${record.Priority}\nSubject: ${record.Subject}`;
      await geoclaw.sendMessage(message, { channel: 'slack', target: '#support' });
      break;
      
    case 'Opportunity':
      message += `\nAmount: $${record.Amount}\nStage: ${record.StageName}`;
      await geoclaw.sendMessage(message, { channel: 'slack', target: '#sales' });
      break;
  }
}
```

## Configuration in geoclaw.config.yml
```yaml
integrations:
  salesforce:
    enabled: ${GEOCLAW_SALESFORCE_ENABLED:-false}
    
    # Authentication
    auth:
      type: ${GEOCLAW_SALESFORCE_AUTH_TYPE:-oauth2}  # oauth2, username_password, jwt
      consumerKeyEnv: GEOCLAW_SALESFORCE_CONSUMER_KEY
      consumerSecretEnv: GEOCLAW_SALESFORCE_CONSUMER_SECRET
      usernameEnv: GEOCLAW_SALESFORCE_USERNAME
      passwordEnv: GEOCLAW_SALESFORCE_PASSWORD
      securityTokenEnv: GEOCLAW_SALESFORCE_SECURITY_TOKEN
      loginUrl: ${GEOCLAW_SALESFORCE_LOGIN_URL:-https://login.salesforce.com}
    
    # API Settings
    apiVersion: ${GEOCLAW_SALESFORCE_API_VERSION:-v58.0}
    timeoutMs: ${GEOCLAW_SALESFORCE_TIMEOUT_MS:-30000}
    maxRetries: ${GEOCLAW_SALESFORCE_MAX_RETRIES:-3}
    
    # Webhook Settings
    webhook:
      enabled: ${GEOCLAW_SALESFORCE_WEBHOOK_ENABLED:-false}
      tokenEnv: GEOCLAW_SALESFORCE_WEBHOOK_TOKEN
      events:
        - case.created
        - case.updated
        - opportunity.created
        - opportunity.stage_changed
    
    # Object Mappings
    objects:
      account:
        fields: [Id, Name, Phone, Industry, AnnualRevenue]
        defaultOrder: Name
        
      contact:
        fields: [Id, FirstName, LastName, Email, Phone, AccountId]
        defaultOrder: LastName
        
      opportunity:
        fields: [Id, Name, Amount, StageName, CloseDate, AccountId]
        defaultOrder: CloseDate DESC
        
      case:
        fields: [Id, CaseNumber, Subject, Status, Priority, CreatedDate]
        defaultOrder: CreatedDate DESC
```

## Use Cases

### 1. Sales Support from Chat
```bash
# Sales rep in Slack
User: @geoclaw Find opportunities closing this month over $50k
Geoclaw: Opportunities closing this month > $50k:
          1. Enterprise Deal - $120k - 80% probability
          2. Renewal Contract - $75k - 90% probability
          3. New Business - $60k - 50% probability

User: @geoclaw Update Enterprise Deal probability to 90%
Geoclaw: Updated Opportunity "Enterprise Deal" probability to 90%
```

### 2. Customer Support Automation
```bash
# Support agent in Telegram
User: /sf case 00001234
Geoclaw: Case #00001234 - Login Issues
          Status: In Progress
          Priority: High
          Created: 2 hours ago
          Customer: Acme Corp
          
User: /sf case update 00001234 --status "Waiting on Customer"
Geoclaw: Updated Case #00001234 status to "Waiting on Customer"
```

### 3. Executive Reporting
```bash
# Executive in Signal
User: @geoclaw Sales dashboard
Geoclaw: 📊 Sales Dashboard - Q1 2024
          • Pipeline: $2.4M
          • Won this month: $450k
          • Top account: TechCorp ($180k)
          • Conversion rate: 32%
          
          🎯 Top opportunities:
          1. Global Expansion - $500k - 75%
          2. Platform Upgrade - $300k - 60%
```

### 4. Team Collaboration
```bash
# Project manager in Monday.com + Salesforce
User: @geoclaw Sync Monday.com task to Salesforce opportunity
Geoclaw: Created Salesforce Opportunity from Monday.com task:
          • Name: "Enterprise Platform"
          • Amount: $250,000
          • Close Date: 2024-06-30
          • Linked to Account: "Global Enterprises"
```

## Security Considerations

### 1. API Security
- Use OAuth 2.0 with refresh tokens
- Store tokens encrypted, never in code
- Implement token rotation
- Use IP restrictions in Salesforce
- Monitor API usage logs

### 2. Data Protection
- Field-level security in Salesforce
- Don't expose sensitive data in logs
- Use masked fields in responses
- Comply with data residency requirements
- Implement data retention policies

### 3. Access Control
- Principle of least privilege
- Different credentials per environment
- Regular permission reviews
- Audit trail of API calls
- Rate limiting per user

## Troubleshooting

### Common Issues

#### Authentication Failures
```javascript
// Token refresh logic
async function refreshAccessToken(client) {
  const response = await fetch('https://login.salesforce.com/services/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: client.consumerKey,
      client_secret: client.consumerSecret,
      refresh_token: client.refreshToken
    })
  });
  
  const data = await response.json();
  client.accessToken = data.access_token;
  // Store new token
}
```

#### API Limits
Salesforce has API request limits (typically 15,000 calls per 24 hours for Enterprise edition).
```javascript
// Implement rate limiting
class RateLimitedSalesforceClient extends SalesforceClient {
  constructor(config) {
    super(config);
    this.queue = [];
    this.maxRequestsPerSecond = 5; // Adjust based on your limits
    this.processing = false;
  }

  async requestWithRateLimit(method, endpoint, data) {
    return new Promise((resolve, reject) => {
      this.queue.push({ method, endpoint, data, resolve, reject });
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  async processQueue() {
    this.processing = true;
    
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      
      try {
        const result = await super.request(item.method, item.endpoint, item.data);
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }
      
      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 1000 / this.maxRequestsPerSecond));
    }
    
    this.processing = false;
  }
}
```

#### Data Volume Issues
For large queries, use queryMore:
```javascript
async function queryAll(client, soql) {
  let allRecords = [];
  let result = await client.query(soql