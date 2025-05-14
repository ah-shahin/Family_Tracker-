import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from "dotenv";
import session from "express-session";

dotenv.config();

const app = express();
const port = 3000;

const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
  secret: "secret-key", // Replace with a strong secret in production
  resave: false,
  saveUninitialized: true
}));

app.set("view engine", "ejs");

// Routes

async function getVisitedCountries(userId) {
  const result = await db.query(
    "SELECT country_code FROM visited_countries WHERE user_id = $1",
    [userId]
  );
  return result.rows.map(row => row.country_code);
}

async function getUserById(id) {
  const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0];
}

async function getAllUsers() {
  const result = await db.query("SELECT * FROM users");
  return result.rows;
}

app.get("/", async (req, res) => {
  try {
    const users = await getAllUsers();
    const currentUserId = req.session.userId || users[0]?.id;

    req.session.userId = currentUserId;

    const currentUser = await getUserById(currentUserId);
    const countries = await getVisitedCountries(currentUserId);

    res.render("index.ejs", {
      countries,
      total: countries.length,
      users,
      color: currentUser.color,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.post("/add", async (req, res) => {
  const input = req.body.country;
  const userId = req.session.userId;

  if (!input || !userId) {
    return res.status(400).send("Invalid request.");
  }

  try {
    const result = await db.query(
      "SELECT country_code FROM countries WHERE LOWER(country_name) LIKE '%' || $1 || '%' LIMIT 1",
      [input.toLowerCase()]
    );

    const country = result.rows[0];
    if (!country) {
      return res.status(404).send("Country not found");
    }

    try {
      await db.query(
        "INSERT INTO visited_countries (country_code, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [country.country_code, userId]
      );
    } catch (insertErr) {
      console.error("Insert error:", insertErr);
    }

    res.redirect("/");
  } catch (err) {
    console.error("Lookup error:", err);
    res.status(500).send("Server error");
  }
});

app.post("/user", async (req, res) => {
  const selected = req.body.user;
  if (req.body.add === "new") {
    res.render("new.ejs");
  } else {
    req.session.userId = parseInt(selected);
    res.redirect("/");
  }
});

app.post("/new", async (req, res) => {
  const name = req.body.name;
  const color = req.body.color;

  if (!name || !color) {
    return res.status(400).send("Name and color are required.");
  }

  try {
    const result = await db.query(
      "INSERT INTO users (name, color) VALUES ($1, $2) RETURNING id",
      [name, color]
    );
    req.session.userId = result.rows[0].id;
    res.redirect("/");
  } catch (err) {
    console.error("User insert error:", err);
    res.status(500).send("Server error");
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
