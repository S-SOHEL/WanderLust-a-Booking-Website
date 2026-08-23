# WanderLust 🌍

WanderLust is a full-stack, Airbnb-inspired property listing and booking web application. Users can browse property listings, view details on an interactive map, sign up/log in, create their own listings with image uploads, and leave reviews on stays.

## Live Demo



## Features

- 🔐 **User Authentication** — Secure signup/login/logout using Passport.js (local strategy)
- 🏠 **Property Listings** — Full CRUD (Create, Read, Update, Delete) for listings
- 🖼️ **Image Uploads** — Listing images uploaded and hosted via Cloudinary
- 🗺️ **Interactive Maps** — Listing locations geocoded and displayed via Mapbox
- ⭐ **Reviews & Ratings** — Users can leave reviews and ratings on listings
- 👤 **Ownership Permissions** — Only listing owners can edit/delete their own listings
- 💬 **Flash Messages** — Success/error feedback using connect-flash
- 🗄️ **Persistent Sessions** — Sessions stored in MongoDB Atlas via connect-mongo
- 📱 **Responsive UI** — Airbnb-inspired design built with Bootstrap 5 & custom CSS

## Tech Stack

**Backend**
- Node.js
- Express.js
- MongoDB + Mongoose
- Passport.js (authentication)
- express-session + connect-mongo (session management)
- connect-flash (flash messages)
- Joi (server-side validation)

**Frontend**
- EJS (templating engine) + ejs-mate
- Bootstrap 5
- Custom CSS (Airbnb-inspired design)
- Font Awesome (icons)

**Third-Party Services**
- MongoDB Atlas (cloud database)
- Cloudinary (image storage & hosting)
- Mapbox (geocoding & interactive maps)

## Project Structure

```
MAJOR PROJECT/
├── controller/         # Route controller logic (listings, users, reviews)
├── models/             # Mongoose schemas (Listing, Review, User)
├── routes/             # Express route definitions
├── views/               
│   ├── listings/       # Listing pages (index, show, new, edit)
│   ├── users/           # Signup/login pages
│   ├── includes/        # Navbar, footer, flash partials
│   └── layouts/          # Boilerplate layout
├── public/
│   ├── css/             # Stylesheets
│   └── js/               # Client-side scripts (map rendering, etc.)
├── utils/               # Error handling helpers (ExpressError, wrapAsync)
├── middleware.js        # Custom middleware (isLoggedIn, isOwner, validation)
├── cloudConfig.js       # Cloudinary configuration
├── schema.js            # Joi validation schemas
├── app.js               # App entry point
└── .env                 # Environment variables (not committed)
```

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- npm
- A MongoDB Atlas account (or local MongoDB instance)
- A Cloudinary account
- A Mapbox account

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/S-SOHEL/WanderLust-a-Booking-Website.git
   cd WanderLust-a-Booking-Website
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Create a `.env` file in the root directory with the following:
   ```env
   ATLASDB_URL=your_mongodb_atlas_connection_string
   SECRET=your_session_secret
   CLOUD_NAME=your_cloudinary_cloud_name
   CLOUD_API_KEY=your_cloudinary_api_key
   CLOUD_API_SECRET=your_cloudinary_api_secret
   MAP_TOKEN=your_mapbox_access_token
   ```

   > ⚠️ Never commit your `.env` file. It's already listed in `.gitignore`.

4. **Run the app**
   ```bash
   nodemon app.js
   ```

   The app will be available at `http://localhost:8080`

## Environment Variables Reference

| Variable | Description |
|---|---|
| `ATLASDB_URL` | MongoDB Atlas connection string |
| `SECRET` | Secret key used for session signing |
| `CLOUD_NAME` | Cloudinary cloud name |
| `CLOUD_API_KEY` | Cloudinary API key |
| `CLOUD_API_SECRET` | Cloudinary API secret |
| `MAP_TOKEN` | Mapbox access token (used for geocoding & maps) |

## Known Issues / Roadmap

- [ ] Map rendering (Mapbox GL) can be blocked by browser WebGL/hardware acceleration settings — investigating a fallback
- [ ] Add pagination for listings index page
- [ ] Add search/filter functionality by location, price, and category
- [ ] Add unit/integration tests

## Acknowledgements

This project was built as part of a learning journey into full-stack MERN-style development (using EJS instead of React), inspired by Airbnb's design and UX patterns.

## License

This project is for educational purposes.
