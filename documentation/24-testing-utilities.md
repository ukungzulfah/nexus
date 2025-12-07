# Testing Utilities

Nexus framework menyediakan comprehensive testing toolkit untuk memudahkan testing aplikasi. Toolkit ini mencakup test client, mock utilities, data factory, mock server, dan load testing capabilities.

## Table of Contents

1. [Overview](#overview)
2. [Test Client](#test-client)
3. [Data Factory](#data-factory)
4. [Mock Utilities](#mock-utilities)
5. [Mock Server](#mock-server)
6. [Load Testing](#load-testing)
7. [Test Suite Setup](#test-suite-setup)
8. [Database Seeding](#database-seeding)
9. [Examples](#examples)

---

## Overview

Testing utilities tersedia di `src/advanced/testing/` dan terdiri dari:

- **`harness.ts`** - Test client, suite, dan assertion helpers
- **`factory.ts`** - Data factory dengan built-in generators
- **`mock.ts`** - Mock functions, database, fetch, timers
- **`mock-server.ts`** - Mock HTTP server untuk testing external APIs
- **`load-test.ts`** - Load testing dan stress testing utilities

### Import

```typescript
import {
  TestClient,
  createTestSuite,
  TestSeeder,
  expectDuration,
  expectSnapshot,
  waitFor,
  retry,
  spyOn,
  // Factory
  defineFactory,
  generators,
  // Mock
  createMockFn,
  MockDatabase,
  MockFetch,
  MockTimers,
  EventSpy,
  // Mock Server
  createMockServer,
  mockResponses,
  // Load Test
  createLoadTest,
  formatLoadTestResults
} from '../advanced/testing';
```

---

## Test Client

`TestClient` adalah HTTP client untuk testing API endpoints dengan support untuk authentication, headers, dan various HTTP methods.

### Basic Usage

```typescript
import { TestClient } from '../advanced/testing';
import { app } from './app';

const client = new TestClient(app);

// GET request
const response = await client.get('/api/users');
console.log(response.status); // 200
console.log(response.json()); // parsed JSON

// POST request
const createResponse = await client.post('/api/users', {
  body: { name: 'John', email: 'john@example.com' }
});

// PUT request
const updateResponse = await client.put('/api/users/1', {
  body: { name: 'Jane' }
});

// DELETE request
const deleteResponse = await client.delete('/api/users/1');

// PATCH request
const patchResponse = await client.patch('/api/users/1', {
  body: { active: true }
});
```

### Query Parameters

```typescript
const response = await client.get('/api/users', {
  query: {
    page: 1,
    limit: 10,
    search: 'john'
  }
});
```

### Custom Headers

```typescript
// Set default headers for all requests
client.setDefaultHeaders({
  'X-API-Key': 'secret-key',
  'Accept-Language': 'en-US'
});

// Or set headers per request
const response = await client.get('/api/data', {
  headers: {
    'X-Request-ID': 'req-123'
  }
});
```

### Authentication

```typescript
// Authenticate with token
client.authenticate('eyJhbGc...');

// Authenticate dengan user object
client.authenticate({
  token: 'eyJhbGc...',
  id: 1,
  email: 'user@example.com'
});

// Get authenticated user
const user = client.getAuthUser();

// Clear authentication
client.clearAuth();
```

### Response Object

```typescript
interface TestResponse<T = any> {
  status: number;
  headers: Record<string, string | string[]>;
  body: string;
  duration: number;
  json(): T;
}

const response = await client.get('/api/users/1');
console.log(response.status);   // 200
console.log(response.duration); // milliseconds
console.log(response.json());   // parsed body
```

### Client Lifecycle

```typescript
const client = new TestClient(app);

// Start server (automatic, tapi bisa explicit)
await client.start();

// Use client...
const response = await client.get('/api/users');

// Stop server
await client.stop();
```

---

## Data Factory

Data factory untuk generate realistic test data dengan support untuk traits, sequences, dan custom generators.

### Defining a Factory

```typescript
import { defineFactory, generators } from '../advanced/testing';

const userFactory = defineFactory({
  id: generators.uuid(),
  email: generators.email(),
  firstName: generators.firstName(),
  lastName: generators.lastName(),
  username: generators.username(),
  password: generators.password(),
  phone: generators.phone(),
  createdAt: generators.pastDate(365)
});

// Build a single record (in-memory, tidak disimpan)
const user = userFactory.build();
// { 
//   id: 'uuid-123',
//   email: 'user_1@example.com',
//   firstName: 'John',
//   ...
// }

// Build banyak records
const users = userFactory.buildMany(5);

// Build dengan overrides
const adminUser = userFactory.build({
  overrides: {
    email: 'admin@example.com',
    role: 'admin'
  }
});
```

### Traits

Traits adalah variations dari factory yang bisa di-apply:

```typescript
const userFactory = defineFactory({
  id: generators.uuid(),
  email: generators.email(),
  role: 'user',
  active: true
});

userFactory.trait('admin', {
  role: 'admin'
});

userFactory.trait('inactive', {
  active: false
});

// Use traits
const admin = userFactory.build({ traits: ['admin'] });
const inactiveUser = userFactory.build({ traits: ['inactive'] });
const inactiveAdmin = userFactory.build({ traits: ['admin', 'inactive'] });
```

### Persistence

```typescript
// Set persist function untuk save ke database
userFactory.setPersist(async (user) => {
  return db.users.create(user);
});

// Create dengan persistence
const savedUser = await userFactory.create();

// Create banyak dengan persistence
const savedUsers = await userFactory.createMany(10);
```

### After Create Hooks

```typescript
userFactory.afterCreate(async (user) => {
  // Create related data
  await db.profiles.create({
    userId: user.id,
    bio: 'New user'
  });
});

const user = await userFactory.create();
// User dan profile akan dibuat
```

### Built-in Generators

#### UUID dan ID

```typescript
generators.uuid()                    // Random UUID
generators.sequence('USER_')         // USER_1, USER_2, ...
```

#### Numbers

```typescript
generators.integer(0, 100)           // Random integer
generators.float(0, 100, 2)          // Random float with decimals
generators.boolean(0.7)              // 70% chance true
```

#### Text

```typescript
generators.string(10)                // Random string (10 chars)
generators.lorem(10)                 // 10 random lorem words
generators.paragraph(3)              // 3 sentences
generators.slug()                    // url-slug-123-abc
```

#### Person Data

```typescript
generators.firstName()               // 'John'
generators.lastName()                // 'Smith'
generators.fullName()                // 'John Smith'
generators.email()                   // 'user_1@example.com'
generators.username()                // 'user_1_abc'
generators.phone()                   // '123-456-7890'
```

#### Company Data

```typescript
generators.company()                 // 'TechCorp Solutions'
generators.jobTitle()                // 'Senior Developer'
```

#### Dates

```typescript
generators.date(start, end)          // Random date between start and end
generators.pastDate(365)             // Date up to 365 days ago
generators.futureDate(365)           // Date up to 365 days in future
```

#### Web/Network

```typescript
generators.url()                     // 'https://example.com/abc123'
generators.ipv4()                    // '192.168.1.1'
generators.slug()                    // 'slug-1-abc'
```

#### Commerce

```typescript
generators.price(1, 1000)            // Random price
generators.currency()                // 'USD'
generators.countryCode()             // 'US'
generators.address()                 // { street, city, state, zip }
```

#### Media

```typescript
generators.hexColor()                // '#a1b2c3'
generators.filePath()                // '/documents/abc.pdf'
generators.mimeType()                // 'application/json'
generators.creditCard()              // '1234-5678-9012-3456'
```

#### Collections

```typescript
generators.oneOf(['a', 'b', 'c'])    // Pick one random
generators.someOf(['a', 'b', 'c'], 1, 2)  // Pick 1-2 items
```

---

## Mock Utilities

Utilities untuk mock functions, database, fetch, timers, dan events.

### Mock Functions

```typescript
import { createMockFn } from '../advanced/testing';

const mockFn = createMockFn();

// Set return value
mockFn.mockReturnValue('hello');
mockFn();  // 'hello'

// Set return value for one call
mockFn.mockReturnValueOnce('first');
mockFn.mockReturnValue('second');
mockFn();  // 'first'
mockFn();  // 'second'

// Async mocking
mockFn.mockResolvedValue({ id: 1 });
await mockFn();  // { id: 1 }

// Async reject
mockFn.mockRejectedValue(new Error('Failed'));
try {
  await mockFn();
} catch (error) {
  console.log(error.message);  // 'Failed'
}

// Custom implementation
mockFn.mockImplementation((x) => x * 2);
mockFn(5);  // 10

// Assertions
if (mockFn.toHaveBeenCalled()) {
  console.log('Function was called');
}

if (mockFn.toHaveBeenCalledWith(5)) {
  console.log('Called with 5');
}

console.log(mockFn.calls);     // Array of all calls
console.log(mockFn.results);   // Array of all results
```

### Mock Database

```typescript
import { MockDatabase } from '../advanced/testing';

const mockDb = new MockDatabase();
const users = mockDb.table('users');

// Insert
const user = await users.insert({ name: 'John', email: 'john@example.com' });

// Find
const found = await users.find(user.id);

// Find many
const all = await users.findMany();
const filtered = await users.findMany({ name: 'John' });

// Update
const updated = await users.update(user.id, { name: 'Jane' });

// Delete
const deleted = await users.delete(user.id);

// Seed data
users.seed([
  { id: 1, name: 'John', email: 'john@example.com' },
  { id: 2, name: 'Jane', email: 'jane@example.com' }
]);

// Get all records
const records = users.getAll();

// Clear data
users.clear();

// Reset (clear data + reset mocks)
users.reset();

// Assertions on mock calls
console.log(users.insert.calls);  // Semua calls ke insert()
console.log(users.update.calls);  // Semua calls ke update()
```

### Mock Fetch

```typescript
import { mockFetch } from '../advanced/testing';

// Register mock routes
mockFetch
  .get('/api/users')
  .reply(200, [{ id: 1, name: 'John' }]);

mockFetch
  .post('/api/users')
  .reply(201, { id: 2, name: 'Jane' });

mockFetch
  .delete('/api/users/:id')
  .reply(204);

// Install globally
mockFetch.install();

// Use fetch normally
const response = await fetch('/api/users');
const data = await response.json();

// Restore original fetch
mockFetch.restore();

// Assertions
if (mockFetch.wasCalled('/api/users', 'GET')) {
  console.log('GET /api/users was called');
}

console.log(mockFetch.getCalls());  // All fetch calls
```

### Mock Fetch dengan Custom Handler

```typescript
mockFetch
  .post('/api/users')
  .replyWith(async (url, options) => {
    const body = JSON.parse(options?.body || '{}');
    return {
      status: 201,
      body: { id: Math.random(), ...body }
    };
  });

// Simulate errors
mockFetch
  .get('/api/error')
  .networkError('Connection refused');

mockFetch
  .get('/api/timeout')
  .timeout(5000);
```

### Mock Timers

```typescript
import { mockTimers } from '../advanced/testing';

// Install mock timers
mockTimers.install();

// Set current time
mockTimers.setTime(Date.now());

// Use setTimeout normally
let called = false;
setTimeout(() => { called = true; }, 1000);

// Advance time
await mockTimers.tick(1000);
console.log(called);  // true

// Run all pending timers
await mockTimers.runAll();

// Get current mocked time
console.log(mockTimers.now());

// Restore
mockTimers.restore();
```

### Event Spy

```typescript
import { EventSpy } from '../advanced/testing';
import { EventEmitter } from 'events';

const emitter = new EventEmitter();
const spy = new EventSpy(emitter);

// Spy on events
spy.on('data').on('error').on('complete');

// Emit events
emitter.emit('data', { id: 1 });
emitter.emit('data', { id: 2 });
emitter.emit('complete');

// Assertions
if (spy.wasEmitted('data')) {
  console.log('Data event was emitted');
}

console.log(spy.count('data'));           // 2
console.log(spy.getCalls('data'));        // [[{ id: 1 }], [{ id: 2 }]]

// Clear
spy.clear();
```

---

## Mock Server

Mock HTTP server untuk testing external API calls.

### Basic Setup

```typescript
import { createMockServer } from '../advanced/testing';

const mockServer = createMockServer();

// Register routes
mockServer.get('/api/users', (req) => ({
  status: 200,
  body: [{ id: 1, name: 'John' }]
}));

mockServer.post('/api/users', (req) => ({
  status: 201,
  body: { id: 2, ...req.body }
}));

// Start server
const url = await mockServer.start(3001);
console.log(url);  // 'http://127.0.0.1:3001'

// Use it...
const response = await fetch(`${url}/api/users`);

// Stop server
await mockServer.stop();
```

### Route Patterns

```typescript
// Exact path
mockServer.get('/api/users', handler);

// Path parameters
mockServer.get('/api/users/:id', (req) => {
  console.log(req.params.id);  // '123'
  return { status: 200, body: { id: req.params.id } };
});

// Regex pattern
mockServer.get(/^\/api\/v\d+\/users/, handler);

// Any method
mockServer.any('/webhook', handler);
```

### Request Object

```typescript
mockServer.post('/api/data', (req) => {
  console.log(req.method);     // 'POST'
  console.log(req.path);       // '/api/data'
  console.log(req.query);      // { page: '1', limit: '10' }
  console.log(req.headers);    // { 'content-type': 'application/json' }
  console.log(req.body);       // Parsed JSON atau raw string
  console.log(req.params);     // URL parameters dari path pattern

  return { status: 200 };
});
```

### Response Helpers

```typescript
import { mockResponses } from '../advanced/testing';

mockServer.get('/ok', mockResponses.ok());
mockServer.post('/created', mockResponses.created({ id: 1 }));
mockServer.get('/no-content', mockResponses.noContent());
mockServer.get('/error', mockResponses.badRequest('Invalid input'));
mockServer.get('/unauthorized', mockResponses.unauthorized());
mockServer.get('/forbidden', mockResponses.forbidden());
mockServer.get('/not-found', mockResponses.notFound());
mockServer.get('/error', mockResponses.serverError());

// Echo request back
mockServer.get('/echo', mockResponses.echo());

// Paginated response
const items = Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }));
mockServer.get('/items', mockResponses.paginated(items, 10));
```

### Route Configuration

```typescript
mockServer
  .get('/api/data')
  .delay(500)           // Delay 500ms before response
  .times(1)             // Respond only once
  .reply(200, { data: 'value' });

// Handler for dynamic responses
mockServer
  .post('/api/users')
  .replyWith(async (req) => {
    if (!req.body.email) {
      return { status: 400, body: { error: 'Email required' } };
    }
    return { status: 201, body: { id: 1, ...req.body } };
  });
```

### Assertions

```typescript
const mockServer = createMockServer();

// ... register routes and use them

// Check if path was called
if (mockServer.wasCalled('/api/users', 'GET')) {
  console.log('GET /api/users was called');
}

// Get call count
const count = mockServer.callCount('/api/users', 'GET');
console.log(`Called ${count} times`);

// Get all requests
const requests = mockServer.getRequests();
requests.forEach(req => {
  console.log(`${req.method} ${req.path}`);
});

// Clear request history
mockServer.clearRequests();

// Reset everything
mockServer.reset();
```

---

## Load Testing

Utilities untuk load testing dan stress testing APIs.

### Basic Load Test

```typescript
import { createLoadTest, formatLoadTestResults } from '../advanced/testing';

const loadTest = createLoadTest({
  baseUrl: 'http://localhost:3000',
  vus: 10,                    // 10 virtual users
  duration: '30s'             // 30 seconds
});

// Register test function
loadTest.test('default', async (vu, http) => {
  const response = await http.get('/api/users');
  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }
});

// Run test
const results = await loadTest.run();

// Format and print results
console.log(formatLoadTestResults(results));
```

### Scenarios

```typescript
const loadTest = createLoadTest({
  baseUrl: 'http://localhost:3000',
  scenarios: {
    'ramp-up': {
      name: 'Ramping up',
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 10 },
        { duration: '20s', target: 50 },
        { duration: '10s', target: 0 }
      ],
      exec: 'load-test'
    },
    'spike': {
      name: 'Spike test',
      executor: 'constant-vus',
      vus: 100,
      duration: '5s',
      exec: 'load-test'
    }
  }
});

loadTest.test('load-test', async (vu, http) => {
  await http.get('/api/users');
});

const results = await loadTest.run();
```

### Thresholds

```typescript
const loadTest = createLoadTest({
  baseUrl: 'http://localhost:3000',
  vus: 10,
  duration: '30s',
  thresholds: {
    'http_req_duration': [
      'p(95) < 500',     // 95% requests under 500ms
      'p(99) < 1000',    // 99% requests under 1000ms
      'avg < 200'        // average under 200ms
    ],
    'http_req_failed': [
      'rate < 0.01'      // Less than 1% error rate
    ],
    'http_reqs': [
      'rate > 100'       // At least 100 requests per second
    ]
  }
});

loadTest.test('load-test', async (vu, http) => {
  await http.get('/api/users');
});

const results = await loadTest.run();
console.log(results.thresholdsPassed);  // true or false
```

### HTTP Client

```typescript
loadTest.test('api-test', async (vu, http) => {
  // GET request
  const getResp = await http.get('/api/users', {
    timeout: 5000
  });

  // POST request
  const postResp = await http.post('/api/users', {
    name: `User ${vu.id}`,
    email: `user${vu.id}@example.com`
  });

  // PUT/DELETE requests
  await http.put('/api/users/1', { name: 'Updated' });
  await http.delete('/api/users/1');

  // Set headers
  http.setHeader('Authorization', `Bearer ${vu.data.token}`);

  // Store data per VU
  vu.data.userId = postResp.json().id;
});
```

### Response Object

```typescript
interface HttpResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: string;
  latency: number;  // milliseconds
}

loadTest.test('api-test', async (vu, http) => {
  const response = await http.get('/api/data');
  console.log(response.status);   // HTTP status
  console.log(response.latency);  // Response time in ms
  console.log(response.body);     // Response body
  console.log(response.headers);  // Response headers
});
```

### Results

```typescript
interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  duration: number;                    // milliseconds
  requestsPerSecond: number;
  latency: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  errorRate: number;                   // 0-1
  thresholdsPassed: boolean;
  thresholdResults: Record<string, any>;
  errors: Array<{ message: string; count: number }>;
}
```

---

## Test Suite Setup

Helper untuk setup test suite dengan automatic lifecycle management.

### Basic Test Suite

```typescript
import { createTestSuite } from '../advanced/testing';
import { app } from './app';

const suite = createTestSuite({
  app,
  beforeAll: async () => {
    // Setup: init database, seed data, etc
    await db.migrate();
  },
  afterAll: async () => {
    // Teardown: cleanup database, close connections, etc
    await db.close();
  },
  beforeEach: async () => {
    // Before each test: seed fresh data
    await seedTestData();
  },
  afterEach: async () => {
    // After each test: cleanup data
    await db.truncate('users');
  }
});

// In your test
const ctx = await suite.setup();
const response = await ctx.client.get('/api/users');
await suite.teardown();
```

---

## Database Seeding

Helper untuk seed database dengan test data.

### Test Seeder

```typescript
import { TestSeeder } from '../advanced/testing';

const seeder = new TestSeeder();

// Configure database functions
seeder.configure({
  insert: async (table, data) => {
    return db[table].insertMany(data);
  },
  truncate: async (table) => {
    return db[table].truncate();
  }
});

// Define seed data
seeder.define('users', [
  { id: 1, name: 'John', email: 'john@example.com' },
  { id: 2, name: 'Jane', email: 'jane@example.com' }
]);

seeder.define('posts', [
  { id: 1, userId: 1, title: 'Post 1' },
  { id: 2, userId: 2, title: 'Post 2' }
]);

// Seed specific table
await seeder.seed('users');

// Seed all defined tables
await seeder.seedAll();

// Seed dengan custom data
await seeder.seed('users', [
  { id: 3, name: 'Bob', email: 'bob@example.com' }
]);

// Truncate tables
await seeder.truncateAll();
```

---

## Assertion Helpers

### Performance Assertions

```typescript
import { expectDuration } from '../advanced/testing';

const response = await client.get('/api/data');

expectDuration(response).toBeLessThan(500);      // < 500ms
expectDuration(response).toBeGreaterThan(10);    // > 10ms
expectDuration(response).toBeBetween(50, 500);   // 50-500ms
```

### Snapshot Testing

```typescript
import { expectSnapshot, updateSnapshots } from '../advanced/testing';

// Capture snapshot (first run)
const response = await client.get('/api/users');
expectSnapshot('users-list', response.json()).toMatchSnapshot();

// Update snapshots when needed
updateSnapshots(true);
expectSnapshot('users-list', newData).toMatchSnapshot();
updateSnapshots(false);
```

### Utility Functions

```typescript
import { waitFor, retry, spyOn } from '../advanced/testing';

// Wait for condition
await waitFor(() => someCondition, {
  timeout: 5000,
  interval: 100
});

// Retry operation
const result = await retry(
  async () => await unreliableOperation(),
  {
    attempts: 3,
    delay: 100,
    backoff: true
  }
);

// Spy on method
const obj = { method: () => 'result' };
const spy = spyOn(obj, 'method');
obj.method();
obj.method();
console.log(spy.calls);  // [[],[]]
spy.restore();
```

---

## Examples

### Example 1: API Testing

```typescript
import { TestClient, defineFactory, generators } from '../advanced/testing';
import { app } from './app';

describe('Users API', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = new TestClient(app);
    await client.start();
  });

  afterAll(async () => {
    await client.stop();
  });

  it('should get all users', async () => {
    const response = await client.get('/api/users');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });

  it('should create user', async () => {
    const response = await client.post('/api/users', {
      body: {
        name: 'John Doe',
        email: 'john@example.com'
      }
    });
    expect(response.status).toBe(201);
    expect(response.json().id).toBeDefined();
  });

  it('should authenticate user', async () => {
    const loginResp = await client.post('/api/auth/login', {
      body: { email: 'john@example.com', password: 'password' }
    });

    client.authenticate(loginResp.json().token);

    const userResp = await client.get('/api/me');
    expect(userResp.status).toBe(200);

    client.clearAuth();
  });
});
```

### Example 2: Data Factory

```typescript
import { defineFactory, generators } from '../advanced/testing';

const userFactory = defineFactory({
  id: generators.uuid(),
  email: generators.email(),
  firstName: generators.firstName(),
  lastName: generators.lastName(),
  phone: generators.phone(),
  country: generators.countryCode(),
  createdAt: generators.pastDate(365)
});

userFactory.trait('admin', {
  role: 'admin',
  permissions: ['read', 'write', 'delete']
});

userFactory.trait('inactive', {
  active: false
});

// Usage
const user = userFactory.build();
const admin = userFactory.build({ traits: ['admin'] });
const inactiveUsers = userFactory.buildMany(10, { traits: ['inactive'] });
```

### Example 3: Mock Server

```typescript
import { createMockServer } from '../advanced/testing';
import axios from 'axios';

describe('External API Integration', () => {
  let mockServer;
  let serverUrl;

  beforeAll(async () => {
    mockServer = createMockServer();
    
    mockServer.get('/api/users', (req) => ({
      status: 200,
      body: [{ id: 1, name: 'John' }]
    }));

    mockServer.post('/api/users', (req) => ({
      status: 201,
      body: { id: 2, ...req.body }
    }));

    serverUrl = await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('should call external API', async () => {
    const response = await axios.get(`${serverUrl}/api/users`);
    expect(response.status).toBe(200);
    expect(response.data).toHaveLength(1);
  });

  it('should track API calls', () => {
    expect(mockServer.wasCalled('/api/users', 'GET')).toBe(true);
    expect(mockServer.callCount('/api/users', 'GET')).toBe(1);
  });
});
```

### Example 4: Load Testing

```typescript
import { createLoadTest, formatLoadTestResults } from '../advanced/testing';

describe('Load Testing', () => {
  it('should handle concurrent requests', async () => {
    const loadTest = createLoadTest({
      baseUrl: 'http://localhost:3000',
      vus: 50,
      duration: '60s',
      thresholds: {
        'http_req_duration': ['p(95) < 500', 'p(99) < 1000'],
        'http_req_failed': ['rate < 0.01']
      }
    });

    loadTest.test('default', async (vu, http) => {
      const response = await http.get('/api/users');
      if (response.status !== 200) {
        throw new Error(`Expected 200, got ${response.status}`);
      }
    });

    const results = await loadTest.run();
    
    console.log(formatLoadTestResults(results));
    expect(results.thresholdsPassed).toBe(true);
  });
});
```

### Example 5: Complete Integration Test

```typescript
import {
  TestClient,
  createTestSuite,
  defineFactory,
  generators,
  MockDatabase
} from '../advanced/testing';
import { app } from './app';

describe('Complete User Flow', () => {
  const suite = createTestSuite({
    app,
    beforeAll: async () => {
      await db.connect();
    },
    afterAll: async () => {
      await db.disconnect();
    },
    beforeEach: async () => {
      await db.truncate('users');
    }
  });

  const userFactory = defineFactory({
    id: generators.uuid(),
    email: generators.email(),
    password: generators.password(),
    name: generators.fullName()
  });

  userFactory.setPersist(async (user) => {
    return db.users.create(user);
  });

  it('should complete user lifecycle', async () => {
    const ctx = await suite.setup();

    // Create user
    const created = await userFactory.create();
    expect(created.id).toBeDefined();

    // Get user
    const response = await ctx.client.get(`/api/users/${created.id}`);
    expect(response.status).toBe(200);
    expect(response.json().email).toBe(created.email);

    // Update user
    const updateResp = await ctx.client.put(`/api/users/${created.id}`, {
      body: { name: 'Updated Name' }
    });
    expect(updateResp.status).toBe(200);

    // Delete user
    const deleteResp = await ctx.client.delete(`/api/users/${created.id}`);
    expect(deleteResp.status).toBe(204);

    await suite.teardown();
  });
});
```

---

## Best Practices

1. **Use Factories for Complex Data**
   - Lebih maintainable daripada manual object creation
   - Traits untuk variations yang berbeda

2. **Isolate Tests**
   - Gunakan `beforeEach` untuk clean state
   - Truncate tables sebelum setiap test

3. **Mock External Dependencies**
   - Gunakan MockServer untuk external APIs
   - MockFetch untuk fetch calls
   - MockDatabase untuk database operations

4. **Performance Testing**
   - Monitor p95 dan p99 latencies
   - Set realistic thresholds
   - Test dengan realistic load scenarios

5. **Error Scenarios**
   - Test error paths dengan mock servers
   - Test timeouts dan network errors
   - Test retry logic dengan MockTimers

---

## See Also

- [01 - Getting Started](./01-getting-started.md)
- [05 - Validation](./05-validation.md)
- [06 - Error Handling](./06-error-handling.md)
- [10 - Examples](./10-examples.md)
