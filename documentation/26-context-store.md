# ContextStore & RequestStore - State Management

Nexus menyediakan dua jenis state management yang terinspirasi dari Flutter's Provider pattern:

| Store Type | Scope | Lifetime | Use Case |
|------------|-------|----------|----------|
| **ContextStore** | Global (Singleton) | App lifetime | User session, cache, shared state |
| **RequestStore** | Per-request | Request only | Form processing, temp calculations |

## Konsep Utama

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Application                                │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │              StoreRegistry (Global/Singleton)               │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │     │
│  │  │ UserStore   │  │ CartStore   │  │ CacheStore  │         │     │
│  │  │ (persist)   │  │ (persist)   │  │ (persist)   │         │     │
│  │  └─────────────┘  └─────────────┘  └─────────────┘         │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │    Request 1                    Request 2                   │     │
│  │  ┌──────────────┐            ┌──────────────┐              │     │
│  │  │CheckoutStore │            │CheckoutStore │              │     │
│  │  │ (disposed)   │            │ (disposed)   │              │     │
│  │  └──────────────┘            └──────────────┘              │     │
│  │    Different instance!         Different instance!          │     │
│  └────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### ContextStore (Global)

```typescript
import { ContextStore, createApp } from 'nexus-framework';

// 1. Define state type
interface UserState {
  users: User[];
  loading: boolean;
}

// 2. Create store class
class UserStore extends ContextStore<UserState> {
  protected initial(): UserState {
    return { users: [], loading: false };
  }

  async fetchUsers() {
    this.update({ loading: true });
    const users = await api.getUsers();
    this.set({ users, loading: false });
  }
}

// 3. Register store
const app = createApp();
app.stores([UserStore]);

// 4. Access in routes
app.get('/users', async (ctx) => {
  const userStore = ctx.store(UserStore);
  return { users: userStore.state.users };
});
```

### RequestStore (Per-Request)

```typescript
import { RequestStore } from 'nexus-framework';

// 1. Define state type
interface CheckoutState {
  items: Item[];
  total: number;
}

// 2. Create store class (NO registration needed!)
class CheckoutStore extends RequestStore<CheckoutState> {
  protected initial(): CheckoutState {
    return { items: [], total: 0 };
  }

  addItem(item: Item) {
    const items = [...this.state.items, item];
    const total = items.reduce((sum, i) => sum + i.price, 0);
    this.set({ items, total });
  }
}

// 3. Access in routes (auto-created on first access)
app.post('/checkout', async (ctx) => {
  const checkout = ctx.requestStore(CheckoutStore);
  checkout.addItem(ctx.body.item);
  return { total: checkout.state.total };
});
// Store automatically disposed after response!
```

---

## ContextStore (Global) - Detail

### Kapan Pakai?

- ✅ Data yang perlu persist (user session, authentication)
- ✅ Shared state antar requests (cache, counters)
- ✅ Real-time features (WebSocket state, SSE)
- ✅ Background tasks state

### API Reference

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `state` | `Readonly<T>` | Current state (read-only) |
| `name` | `string` | Store name (default: class name) |
| `listenerCount` | `number` | Active listeners count |
| `isInitialized` | `boolean` | Initialization status |

#### Methods

| Method | Description |
|--------|-------------|
| `protected initial(): T` | **Required.** Return initial state |
| `protected set(state: T)` | Replace entire state |
| `protected update(partial: Partial<T>)` | Merge partial state |
| `listen(callback): unsubscribe` | Subscribe to changes |
| `reset()` | Reset to initial state |
| `dispose()` | Cleanup store |

#### Lifecycle Hooks

| Hook | When Called |
|------|-------------|
| `onInit()` | After registration |
| `onDispose()` | Before disposal |

### Example: Real-time Counter

```typescript
class CounterStore extends ContextStore<{ count: number }> {
  protected initial() {
    return { count: 0 };
  }

  increment() {
    this.update({ count: this.state.count + 1 });
  }

  decrement() {
    this.update({ count: this.state.count - 1 });
  }
}

// Register
app.stores([CounterStore]);

// Increment from any route
app.post('/increment', async (ctx) => {
  ctx.store(CounterStore).increment();
  return { count: ctx.store(CounterStore).state.count };
});

// SSE - real-time updates
app.get('/counter-stream', async (ctx) => {
  const counter = ctx.store(CounterStore);
  
  ctx.raw.res.setHeader('Content-Type', 'text/event-stream');
  
  const unsubscribe = counter.listen((state) => {
    ctx.raw.res.write(`data: ${JSON.stringify(state)}\n\n`);
  });
  
  ctx.raw.req.on('close', unsubscribe);
  return new Promise(() => {}); // Keep alive
});
```

---

## RequestStore (Per-Request) - Detail

### Kapan Pakai?

- ✅ Form processing (checkout, wizard steps)
- ✅ Request-specific calculations
- ✅ Temporary data aggregation
- ✅ Multi-step operations dalam satu request

### API Reference

Same as ContextStore, plus:

| Property | Type | Description |
|----------|------|-------------|
| `requestId` | `string` | Unique ID per request |

### Key Differences from ContextStore

| Aspect | ContextStore | RequestStore |
|--------|--------------|--------------|
| Registration | `app.stores([...])` | **Not needed** |
| Access | `ctx.store(Class)` | `ctx.requestStore(Class)` |
| Lifetime | App lifetime | Request only |
| Instance | Singleton | Fresh per request |
| Disposal | Manual/shutdown | Auto after response |

### Example: Multi-Step Checkout

```typescript
interface CheckoutState {
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  step: 'cart' | 'shipping' | 'payment' | 'confirm';
}

class CheckoutStore extends RequestStore<CheckoutState> {
  protected initial(): CheckoutState {
    return {
      items: [],
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      step: 'cart'
    };
  }

  addItem(item: CartItem) {
    const items = [...this.state.items, item];
    this.recalculate(items);
  }

  applyDiscount(code: string) {
    const discount = this.calculateDiscount(code);
    this.recalculate(this.state.items, discount);
  }

  private recalculate(items: CartItem[], discount = this.state.discount) {
    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const afterDiscount = subtotal - discount;
    const tax = afterDiscount * 0.11;
    const total = afterDiscount + tax;

    this.set({
      ...this.state,
      items,
      subtotal,
      discount,
      tax,
      total
    });
  }

  nextStep() {
    const steps: CheckoutState['step'][] = ['cart', 'shipping', 'payment', 'confirm'];
    const currentIndex = steps.indexOf(this.state.step);
    if (currentIndex < steps.length - 1) {
      this.update({ step: steps[currentIndex + 1] });
    }
  }

  private calculateDiscount(code: string): number {
    const discounts: Record<string, number> = {
      'SAVE10': this.state.subtotal * 0.1,
      'SAVE20': this.state.subtotal * 0.2,
    };
    return discounts[code] || 0;
  }
}

// Usage
app.post('/checkout/process', async (ctx) => {
  const checkout = ctx.requestStore(CheckoutStore);
  
  // Step 1: Add items
  for (const item of ctx.body.items) {
    checkout.addItem(item);
  }
  
  // Step 2: Apply discount
  if (ctx.body.discountCode) {
    checkout.applyDiscount(ctx.body.discountCode);
  }
  
  // Step 3: Process each step
  checkout.nextStep(); // cart → shipping
  // validate shipping...
  
  checkout.nextStep(); // shipping → payment
  // process payment...
  
  checkout.nextStep(); // payment → confirm
  
  return {
    requestId: checkout.requestId,
    order: checkout.state
  };
});
// CheckoutStore disposed after response - clean slate for next request!
```

### Example: Request Validation Pipeline

```typescript
interface ValidationState {
  errors: string[];
  warnings: string[];
  isValid: boolean;
}

class ValidationStore extends RequestStore<ValidationState> {
  protected initial() {
    return { errors: [], warnings: [], isValid: true };
  }

  addError(msg: string) {
    this.set({
      errors: [...this.state.errors, msg],
      warnings: this.state.warnings,
      isValid: false
    });
  }

  addWarning(msg: string) {
    this.update({
      warnings: [...this.state.warnings, msg]
    });
  }
}

// Middleware-like usage
app.post('/api/users', async (ctx) => {
  const validation = ctx.requestStore(ValidationStore);
  
  // Validate email
  if (!ctx.body.email?.includes('@')) {
    validation.addError('Invalid email format');
  }
  
  // Validate password
  if (ctx.body.password?.length < 8) {
    validation.addError('Password must be at least 8 characters');
  }
  
  // Check for weak password
  if (ctx.body.password === '12345678') {
    validation.addWarning('Password is too common');
  }
  
  // Return early if invalid
  if (!validation.state.isValid) {
    return ctx.response.status(400).json({
      success: false,
      errors: validation.state.errors,
      warnings: validation.state.warnings
    });
  }
  
  // Proceed with user creation...
  return { success: true };
});
```

---

## Using Both Together

```typescript
// Global: User session
class SessionStore extends ContextStore<{ userId: string | null }> {
  protected initial() { return { userId: null }; }
  
  login(userId: string) { this.update({ userId }); }
  logout() { this.update({ userId: null }); }
}

// Per-request: Order processing
class OrderStore extends RequestStore<{ items: Item[]; total: number }> {
  protected initial() { return { items: [], total: 0 }; }
  
  addItem(item: Item) {
    const items = [...this.state.items, item];
    this.set({ items, total: items.reduce((s, i) => s + i.price, 0) });
  }
}

app.stores([SessionStore]);

app.post('/order', async (ctx) => {
  // Get global session
  const session = ctx.store(SessionStore);
  
  if (!session.state.userId) {
    return ctx.response.status(401).json({ error: 'Not logged in' });
  }
  
  // Get request-scoped order
  const order = ctx.requestStore(OrderStore);
  
  for (const item of ctx.body.items) {
    order.addItem(item);
  }
  
  // Save order with user ID
  await db.orders.create({
    userId: session.state.userId,
    items: order.state.items,
    total: order.state.total
  });
  
  return { success: true, total: order.state.total };
});
```

---

## Application Methods

### For ContextStore (Global)

| Method | Description |
|--------|-------------|
| `app.store(StoreClass)` | Register single store |
| `app.stores(StoreClass[])` | Register multiple stores |
| `app.getStore(StoreClass)` | Access from app level |
| `app.getStoreRegistry()` | Get registry |

### Context Methods

| Method | Description |
|--------|-------------|
| `ctx.store(StoreClass)` | Access global store |
| `ctx.requestStore(StoreClass)` | Access request-scoped store |

---

## Best Practices

### 1. Immutable Updates

```typescript
// ❌ Mutating state directly
this.state.users.push(user); // Won't trigger listeners!

// ✅ Create new reference
this.set({
  ...this.state,
  users: [...this.state.users, user]
});

// ✅ Or use update() for partial
this.update({
  users: [...this.state.users, user]
});
```

### 2. Computed Properties

```typescript
class CartStore extends ContextStore<CartState> {
  // Use getters for computed values
  get itemCount(): number {
    return this.state.items.length;
  }
  
  get totalPrice(): number {
    return this.state.items.reduce((sum, item) => sum + item.price, 0);
  }
  
  get isEmpty(): boolean {
    return this.state.items.length === 0;
  }
}

// Usage
const cart = ctx.store(CartStore);
console.log(cart.totalPrice); // Computed on access
```

### 3. Async Actions

```typescript
class DataStore extends ContextStore<DataState> {
  async fetchData() {
    // Show loading
    this.update({ loading: true, error: null });
    
    try {
      const data = await api.getData();
      this.update({ data, loading: false });
    } catch (error) {
      this.update({ 
        loading: false, 
        error: error.message 
      });
      throw error; // Re-throw if needed
    }
  }
}
```

### 4. Cleanup Listeners

```typescript
app.get('/events', async (ctx) => {
  const store = ctx.store(MyStore);
  
  // ✅ Always cleanup listeners
  const unsubscribe = store.listen((state) => {
    ctx.raw.res.write(`data: ${JSON.stringify(state)}\n\n`);
  });
  
  ctx.raw.req.on('close', () => {
    unsubscribe(); // Prevent memory leak!
  });
});
```

---

## Type Definitions

```typescript
// Listener callback
type StoreListener<T> = (state: T, prevState: T) => void;

// Unsubscribe function
type DisposeCallback = () => void;

// Store constructor
type StoreConstructor<T extends ContextStore<any>> = new (...args: any[]) => T;
type RequestStoreConstructor<T extends RequestStore<any>> = new (...args: any[]) => T;

// Extract state type
type StateOf<T> = T extends ContextStore<infer S> ? S : never;
type RequestStateOf<T> = T extends RequestStore<infer S> ? S : never;
```

---

## Troubleshooting

### "Store not registered"

```typescript
// ❌ Error: Store UserStore is not registered
ctx.store(UserStore);

// ✅ Solution: Register first
app.stores([UserStore]);
ctx.store(UserStore); // OK!
```

### "RequestStore still has data"

```typescript
// ❌ Wrong expectation: RequestStore shares data
app.get('/a', (ctx) => {
  ctx.requestStore(MyStore).setValue('hello');
});
app.get('/b', (ctx) => {
  // This is ALWAYS empty - different request!
  ctx.requestStore(MyStore).state.value; // undefined
});

// ✅ Use ContextStore for shared data
app.stores([MyStore]);
app.get('/a', (ctx) => ctx.store(MyStore).setValue('hello'));
app.get('/b', (ctx) => ctx.store(MyStore).state.value); // 'hello'
```

### Memory Leak Warning

```typescript
// ❌ Listener never cleaned up
store.listen((state) => { ... });

// ✅ Always cleanup
const unsubscribe = store.listen((state) => { ... });
// Later:
unsubscribe();
```

---

## Migration from Flutter Provider

| Flutter | Nexus |
|---------|-------|
| `ChangeNotifier` | `ContextStore<T>` / `RequestStore<T>` |
| `notifyListeners()` | `set()` / `update()` |
| `Provider.of<T>(context)` | `ctx.store(T)` / `ctx.requestStore(T)` |
| `Consumer<T>` | `store.listen()` |
| `MultiProvider` | `app.stores([...])` |
| Scoped Provider | `RequestStore` |
