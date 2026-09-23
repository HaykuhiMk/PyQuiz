# PyQuiz

PyQuiz is a full-stack quiz platform for practicing Python MCQs.

## Project Structure

- `frontend/`: static pages and browser scripts
- `backend/`: REST API, auth, admin, password reset, contact

Both services are independent Node.js apps and run on separate ports.

## Features

- User registration and login
- Topic-based random quiz flow
- User progress tracking
- Admin login and question creation
- Forgot/reset password flow
- Contact form email delivery

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript, Express static server
- Backend: Node.js, Express, MongoDB (Mongoose), JWT
- Security middleware: Helmet, CORS, rate limiting

## Local Setup

1. Clone repository:

```bash
git clone https://github.com/HaykuhiMk/PyQuiz.git
cd PyQuiz
```

2. Install dependencies:

```bash
cd backend && npm install
cd ../frontend && npm install
```

3. Configure environment variables.

Create `backend/.env`:

```env
PORT=3001
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
CLIENT_URI=http://localhost:3000
API_URI=http://localhost:3001
EMAIL_USER=your_email
EMAIL_PASS=your_email_password
```

Create `frontend/.env`:

```env
PORT=3000
```

4. Run both services:

```bash
cd backend && npm start
cd ../frontend && npm start
```

5. Open [http://localhost:3000](http://localhost:3000).

## Notes

- Frontend API endpoint is configured in `frontend/public/js/config.js`.
- Backend API defaults to `http://localhost:3001`.
- Versioned API is available at `/api/v1/*` with standardized response format.
- Swagger docs are available at `http://localhost:3001/api-docs`.
- Prometheus metrics endpoint is available at `http://localhost:3001/metrics`.

## Backend Quality Tooling

In `backend/`:

- `npm run lint`
- `npm run test`
- `npm run typecheck`
- `npm run build`

## License

MIT





