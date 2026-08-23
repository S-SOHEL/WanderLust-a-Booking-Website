const express = require("express");
const session = require("express-session");

const app = express();

// 

const sessionOptions = { secret: "MysuperSecreatCode!", resave: false, saveUninitialized: true, }; app.use(session(sessionOptions));

app.listen(9090, () => {
  console.log("Test server running on http://localhost:9090");
});

// app.use(session({
//   name: "test.sid",
//   secret: "supersecret123",
//   resave: false,
//   saveUninitialized: true,
//   cookie: {
//     maxAge: 1000 * 60 * 10,
//     httpOnly: true
//   }
// }));

// app.get("/test-session", (req, res) => {
//   req.session.user = "Sohel";
//   res.send("Session created");
// });