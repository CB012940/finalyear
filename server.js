const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const db = new sqlite3.Database('store.db');

function auditLog(action, details) {
  // Placeholder for blockchain logging
  console.log('AUDIT', action, details);
}

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: false }));
app.use(flash());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user;
  res.locals.flash = req.flash();
  next();
});

// Database setup

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    isAdmin INTEGER DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS products(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    price REAL,
    image TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS orders(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    total REAL,
    items TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Middleware to check if user is authenticated
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.isAdmin) return res.redirect('/');
  next();
}

// Routes
app.get('/', (req, res) => {
  db.all('SELECT * FROM products LIMIT 4', (err, products) => {
    res.render('index', { products });
  });
});

app.get('/products', (req, res) => {
  db.all('SELECT * FROM products', (err, products) => {
    res.render('products', { products });
  });
});

app.get('/product/:id', (req, res) => {
  db.get('SELECT * FROM products WHERE id=?', req.params.id, (err, product) => {
    if (!product) return res.redirect('/products');
    res.render('product', { product });
  });
});

app.post('/cart/add/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM products WHERE id=?', id, (err, product) => {
    if (!product) return res.redirect('/products');
    if (!req.session.cart) req.session.cart = [];
    req.session.cart.push(product);
    res.redirect('/cart');
  });
});

app.get('/cart', (req, res) => {
  const cart = req.session.cart || [];
  const total = cart.reduce((s, p) => s + p.price, 0);
  res.render('cart', { cart, total });
});

app.post('/cart/remove/:index', (req, res) => {
  const i = parseInt(req.params.index);
  if (req.session.cart && req.session.cart[i]) {
    req.session.cart.splice(i, 1);
  }
  res.redirect('/cart');
});

app.post('/checkout', requireAuth, (req, res) => {
  const cart = req.session.cart || [];
  if (!cart.length) return res.redirect('/cart');
  const total = cart.reduce((s, p) => s + p.price, 0);
  const items = JSON.stringify(cart);
  db.run('INSERT INTO orders(userId,total,items) VALUES(?,?,?)', [req.session.user.id, total, items], function(err) {
    if (err) return res.redirect('/cart');
    req.session.cart = [];
    auditLog('purchase', { user: req.session.user.id, orderId: this.lastID });
    res.render('confirm', { orderId: this.lastID });
  });
});

app.get('/orders', requireAuth, (req, res) => {
  db.all('SELECT * FROM orders WHERE userId=?', req.session.user.id, (err, orders) => {
    res.render('orders', { orders });
  });
});

app.get('/signup', (req, res) => {
  res.render('signup');
});

app.post('/signup', (req, res) => {
  const { email, password } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  db.run('INSERT INTO users(email,password) VALUES(?,?)', [email, hash], function(err) {
    if (err) {
      req.flash('error', 'Email already used');
      return res.redirect('/signup');
    }
    auditLog('signup', { userId: this.lastID });
    req.session.user = { id: this.lastID, email };
    res.redirect('/');
  });
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email=?', email, (err, user) => {
    if (!user || !bcrypt.compareSync(password, user.password)) {
      req.flash('error', 'Invalid credentials');
      return res.redirect('/login');
    }
    req.session.user = { id: user.id, email: user.email, isAdmin: user.isAdmin };
    res.redirect('/');
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Admin routes
app.get('/admin/products', requireAdmin, (req, res) => {
  db.all('SELECT * FROM products', (err, products) => {
    res.render('admin_products', { products });
  });
});

app.get('/admin/products/new', requireAdmin, (req, res) => {
  res.render('product_form', { product: {} });
});

app.get('/admin/products/edit/:id', requireAdmin, (req, res) => {
  db.get('SELECT * FROM products WHERE id=?', req.params.id, (err, product) => {
    res.render('product_form', { product });
  });
});

app.post('/admin/products/save', requireAdmin, (req, res) => {
  const { id, name, description, price, image } = req.body;
  if (id) {
    db.run('UPDATE products SET name=?, description=?, price=?, image=? WHERE id=?', [name, description, price, image, id], err => {
      auditLog('product_edit', { id });
      res.redirect('/admin/products');
    });
  } else {
    db.run('INSERT INTO products(name,description,price,image) VALUES(?,?,?,?)', [name, description, price, image], function(err){
      auditLog('product_add', { id: this.lastID });
      res.redirect('/admin/products');
    });
  }
});

app.post('/admin/products/delete/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM products WHERE id=?', req.params.id, err => {
    auditLog('product_delete', { id: req.params.id });
    res.redirect('/admin/products');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
