# Template Rendering

Nexus Framework provides a powerful and flexible template rendering system that allows you to serve dynamic HTML pages with data injection. The system supports multiple template engines while maintaining zero overhead for unused features.

## Quick Start

### Simple Placeholder Template (Default - Zero Dependencies)

The simplest way to use templates is with the built-in placeholder syntax:

```typescript
import { createApp, Route, Context } from 'nexus';

class WelcomeRoute extends Route {
  pathName = '/welcome';

  handler(ctx: Context) {
    return this.render('./views/welcome.html', {
      name: 'John Doe',
      email: 'john@example.com'
    });
  }
}

const app = createApp();
app.get(new WelcomeRoute());
app.listen(3000);
```

**Template: `./views/welcome.html`**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Welcome</title>
</head>
<body>
  <h1>Welcome {{ name }}</h1>
  <p>Your email: {{ email }}</p>
</body>
</html>
```

---

## Template Engines

Nexus supports multiple template engines that can be enabled as needed:

| Engine | Extension | Logic Support | Installation |
|--------|-----------|---------------|--------------|
| **Simple** (default) | `.html`, `.txt` | ❌ Variables only | Built-in |
| **Handlebars** | `.hbs`, `.handlebars` | ✅ If/Each/Helpers | `npm install handlebars` |
| **EJS** | `.ejs` | ✅ Full JavaScript | `npm install ejs` |
| **Pug** | `.pug`, `.jade` | ✅ Clean syntax | `npm install pug` |
| **Mustache** | `.mustache`, `.mst` | ✅ Minimal logic | `npm install mustache` |

---

## Enabling Template Engines

### Option 1: Auto-Register via Config (Recommended)

Enable template engines in your app configuration:

```typescript
import { createApp } from 'nexus';

const app = createApp({
  handlebars: true,  // Enable Handlebars
  ejs: true,         // Enable EJS
  debug: true        // Show registration logs
});

// Engines are automatically registered and lazy-loaded
// Install packages: npm install handlebars ejs
```

### Option 2: Manual Registration

```typescript
import { Route, HandlebarsEngine, EJSEngine } from 'nexus';

// Register once at app startup
Route.registerEngine(HandlebarsEngine);
Route.registerEngine(EJSEngine);

// Now all routes can use these engines
```

---

## Template Syntax

### 1. Simple Placeholder (Default)

**Syntax:** `{{ variableName }}`

```html
<!-- Simple variables -->
<h1>{{ title }}</h1>
<p>{{ description }}</p>

<!-- Nested objects -->
<p>User: {{ user.name }}</p>
<p>Email: {{ user.email }}</p>

<!-- Arrays/Objects in JavaScript -->
<script>
  // Objects are automatically JSON.stringify'd
  const user = JSON.parse(`{{ user }}`);
  console.log(user.name);
</script>
```

**Example:**
```typescript
class ProfileRoute extends Route {
  pathName = '/profile';

  handler(ctx: Context) {
    return this.render('./views/profile.html', {
      title: 'User Profile',
      user: {
        name: 'Alice',
        email: 'alice@example.com',
        settings: { theme: 'dark' }
      }
    });
  }
}
```

### 2. Handlebars Templates

**Syntax:** Handlebars expressions with logic support

```handlebars
<!DOCTYPE html>
<html>
<body>
  <h1>{{user.name}}'s Profile</h1>

  {{! Conditionals }}
  {{#if user.isAdmin}}
    <div class="badge">Admin</div>
  {{else}}
    <div class="badge">User</div>
  {{/if}}

  {{! Loops }}
  <h2>Posts</h2>
  <ul>
    {{#each posts}}
      <li>{{this.title}} - {{this.likes}} likes</li>
    {{/each}}
  </ul>

  {{! With helper }}
  {{#with user.settings}}
    <p>Theme: {{theme}}</p>
  {{/with}}
</body>
</html>
```

**Example:**
```typescript
const app = createApp({ handlebars: true });

class DashboardRoute extends Route {
  pathName = '/dashboard';

  handler(ctx: Context) {
    return this.render('./views/dashboard.hbs', {
      user: {
        name: 'Bob',
        isAdmin: true,
        settings: { theme: 'dark' }
      },
      posts: [
        { title: 'First Post', likes: 10 },
        { title: 'Second Post', likes: 25 }
      ]
    });
  }
}

app.get(new DashboardRoute());
```

### 3. EJS Templates

**Syntax:** Embedded JavaScript

```ejs
<!DOCTYPE html>
<html>
<body>
  <h1><%= user.name %>'s Profile</h1>

  <%# Comments %>
  
  <% if (user.isAdmin) { %>
    <div class="badge">Admin</div>
  <% } else { %>
    <div class="badge">User</div>
  <% } %>

  <h2>Posts</h2>
  <ul>
    <% posts.forEach(post => { %>
      <li style="color: <%= post.likes > 20 ? 'green' : 'black' %>">
        <%= post.title %> - <%= post.likes %> likes
      </li>
    <% }); %>
  </ul>
  
  <p>Total: <%= posts.length %> posts</p>
</body>
</html>
```

**Example:**
```typescript
const app = createApp({ ejs: true });

class BlogRoute extends Route {
  pathName = '/blog';

  handler(ctx: Context) {
    return this.render('./views/blog.ejs', {
      user: { name: 'Charlie', isAdmin: false },
      posts: [
        { title: 'EJS Tutorial', likes: 30 },
        { title: 'Node.js Guide', likes: 15 }
      ]
    });
  }
}

app.get(new BlogRoute());
```

### 4. Pug Templates

**Syntax:** Clean, indentation-based

```pug
doctype html
html
  head
    title= title
  body
    h1 Welcome #{user.name}
    
    if user.isAdmin
      .badge Admin
    else
      .badge User
    
    h2 Posts
    ul
      each post in posts
        li= post.title + ' - ' + post.likes + ' likes'
```

**Example:**
```typescript
const app = createApp({ pug: true });

class HomeRoute extends Route {
  pathName = '/';

  handler(ctx: Context) {
    return this.render('./views/home.pug', {
      title: 'Home Page',
      user: { name: 'Dave', isAdmin: true },
      posts: [
        { title: 'Pug Basics', likes: 40 }
      ]
    });
  }
}

app.get(new HomeRoute());
```

---

## Advanced Usage

### Custom Status Code and Headers

```typescript
class ErrorRoute extends Route {
  pathName = '/error';

  handler(ctx: Context) {
    return this.render(
      './views/error.html',
      { message: 'Page not found', code: 404 },
      { 
        status: 404,
        headers: { 
          'X-Error-Type': 'NotFound',
          'Cache-Control': 'no-cache'
        }
      }
    );
  }
}
```

### Force Specific Engine

```typescript
class MixedRoute extends Route {
  pathName = '/mixed';

  handler(ctx: Context) {
    // Force Handlebars even for .html file
    return this.render(
      './views/page.html',
      { data: {...} },
      { engine: 'handlebars' }
    );
  }
}
```

### Conditional Rendering

```typescript
class MemberRoute extends Route {
  pathName = '/member/:id';

  async handler(ctx: Context) {
    const memberCard = await getMemberCard(ctx.params.id);

    if (!memberCard) {
      return this.fail(ctx, 404, 'Member not found');
    }

    if (memberCard.isPremium) {
      return this.render('./views/premium-card.hbs', { memberCard });
    } else {
      return this.render('./views/basic-card.hbs', { memberCard });
    }
  }
}
```

### Dynamic File Paths

```typescript
class LocalizedRoute extends Route {
  pathName = '/:lang/home';

  handler(ctx: Context) {
    const lang = ctx.params.lang || 'en';
    const filePath = `./views/${lang}/home.html`;
    
    return this.render(filePath, {
      user: ctx.get('user'),
      messages: getMessages(lang)
    });
  }
}
```

---

## Complete Example

```typescript
import { createApp, Route, Context } from 'nexus';

// Enable template engines
const app = createApp({
  handlebars: true,
  ejs: true,
  debug: true
});

// Simple placeholder route
class HomeRoute extends Route {
  pathName = '/';

  handler(ctx: Context) {
    return this.render('./views/home.html', {
      title: 'Home',
      message: 'Welcome to Nexus Framework'
    });
  }
}

// Handlebars route with logic
class UsersRoute extends Route {
  pathName = '/users';

  async handler(ctx: Context) {
    const users = await getUsers();
    
    return this.render('./views/users.hbs', {
      users,
      total: users.length,
      currentUser: ctx.get('user')
    });
  }
}

// EJS route with dynamic data
class ProfileRoute extends Route {
  pathName = '/profile/:id';

  async handler(ctx: Context) {
    const user = await getUserById(ctx.params.id);
    
    if (!user) {
      return this.fail(ctx, 404, 'User not found');
    }

    return this.render('./views/profile.ejs', {
      user,
      isOwner: ctx.get('user')?.id === user.id
    });
  }
}

// Error route with custom status
class NotFoundRoute extends Route {
  pathName = '*';

  handler(ctx: Context) {
    return this.render(
      './views/404.html',
      { path: ctx.path },
      { status: 404 }
    );
  }
}

// Register routes
app.get(new HomeRoute());
app.get(new UsersRoute());
app.get(new ProfileRoute());
app.get(new NotFoundRoute());

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

---

## Creating Custom Template Engine

You can create and register your own template engine:

```typescript
import { TemplateEngine, Route } from 'nexus';

const MyCustomEngine: TemplateEngine = {
  name: 'custom',
  extensions: ['.custom', '.tmpl'],
  render(template: string, data: Record<string, any>): string {
    // Your custom rendering logic
    return template.replace(/\$\{(\w+)\}/g, (_, key) => {
      return data[key] || '';
    });
  }
};

// Register your engine
Route.registerEngine(MyCustomEngine);

// Use it
class CustomRoute extends Route {
  handler(ctx: Context) {
    return this.render('./views/page.custom', { name: 'Alice' });
  }
}
```

---

## Best Practices

### 1. Choose the Right Engine

- ✅ **Simple placeholder** - For basic variable injection (fastest, zero deps)
- ✅ **Handlebars** - For moderate logic (if/each/helpers)
- ✅ **EJS** - For full JavaScript in templates
- ✅ **Pug** - For clean, minimal syntax

### 2. Enable Only What You Need

```typescript
// ❌ Don't enable all engines
const app = createApp({
  handlebars: true,
  ejs: true,
  pug: true,
  mustache: true
});

// ✅ Enable only what you use
const app = createApp({
  handlebars: true  // Only if you need it
});
```

### 3. Organize Templates

```
project/
├── views/
│   ├── layouts/
│   │   ├── main.hbs
│   │   └── admin.hbs
│   ├── partials/
│   │   ├── header.hbs
│   │   └── footer.hbs
│   ├── home.hbs
│   ├── profile.hbs
│   └── error.html
└── src/
    └── routes/
```

### 4. Security: Escape User Input

```typescript
// ✅ Safe - data is automatically escaped in most engines
return this.render('./views/page.hbs', {
  userInput: ctx.query.search  // Escaped by Handlebars
});

// ⚠️ Be careful with triple-stash (unescaped)
// {{{ userInput }}} - This won't escape HTML
```

### 5. Performance Tips

```typescript
// ✅ Cache data, not templates (templates are auto-cached by engines)
const cachedUsers = await cache.get('users') || await fetchUsers();

return this.render('./views/users.hbs', { users: cachedUsers });

// ✅ Use async handlers for I/O
async handler(ctx: Context) {
  const [user, posts] = await Promise.all([
    getUser(),
    getPosts()
  ]);
  
  return this.render('./views/profile.hbs', { user, posts });
}
```

---

## API Reference

### `render(filePath, data?, options?)`

Render a template file with data injection.

**Parameters:**
- `filePath` (string) - Path to template file (relative or absolute)
- `data` (object, optional) - Data to inject into template
- `options` (object, optional)
  - `engine` (string) - Force specific engine ('handlebars', 'ejs', etc.)
  - `status` (number) - HTTP status code (default: 200)
  - `headers` (object) - Additional response headers

**Returns:** `Promise<Response>`

**Example:**
```typescript
return this.render('./views/page.hbs', { user }, { 
  status: 200,
  headers: { 'Cache-Control': 'max-age=3600' }
});
```

### `Route.registerEngine(engine)`

Register a custom template engine (static method).

**Parameters:**
- `engine` (TemplateEngine) - Engine implementation

**Example:**
```typescript
import { HandlebarsEngine } from 'nexus';
Route.registerEngine(HandlebarsEngine);
```

---

## Troubleshooting

### Engine Not Found Error

```
Error: Template engine 'handlebars' not registered
```

**Solution:**
```typescript
// Enable in config
const app = createApp({ handlebars: true });

// OR register manually
Route.registerEngine(HandlebarsEngine);

// AND install package
// npm install handlebars
```

### Template File Not Found

```
Error: Template file not found: ./views/home.html
```

**Solution:**
- Check file path (relative to project root)
- Verify file exists
- Use absolute path if needed: `path.resolve(__dirname, '../views/home.html')`

### Module Not Installed

```
Error: Handlebars not installed. Install it with: npm install handlebars
```

**Solution:**
```bash
npm install handlebars
# or
npm install ejs
npm install pug
npm install mustache
```

---

## Migration Guide

### From Express `res.render()`

**Express:**
```javascript
app.get('/users', (req, res) => {
  res.render('users', { users: [...] });
});
```

**Nexus:**
```typescript
class UsersRoute extends Route {
  pathName = '/users';
  
  handler(ctx: Context) {
    return this.render('./views/users.hbs', { users: [...] });
  }
}
```

### From Manual HTML Strings

**Before:**
```typescript
handler(ctx: Context) {
  return ctx.html(`
    <h1>Welcome ${user.name}</h1>
    <p>Email: ${user.email}</p>
  `);
}
```

**After:**
```typescript
handler(ctx: Context) {
  return this.render('./views/welcome.html', { 
    user: { name: '...', email: '...' }
  });
}
```

---

## Related Features

- [Class-Based Routing](./19-class-based-routing.md) - Learn about Route class
- [Static File Serving](./documentation/) - Serve static assets
- [Context API](./02-context.md) - Working with request context
- [Error Handling](./06-error-handling.md) - Handle template errors

---

## Summary

✅ **Simple placeholder syntax** for basic use cases (zero dependencies)  
✅ **Multiple template engines** support (Handlebars, EJS, Pug, Mustache)  
✅ **Auto-registration** via config (`handlebars: true`)  
✅ **Lazy-loading** for zero overhead when unused  
✅ **Type-safe** with full TypeScript support  
✅ **Flexible** - custom engines, status codes, headers  

🚀 Start with simple placeholders, upgrade to advanced engines when needed!
