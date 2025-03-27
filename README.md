# PyQuiz

PyQuiz is an interactive quiz application built with Node.js, Express, MongoDB, and JavaScript. It features user authentication, quiz sessions, and an admin panel for managing questions.

## Features

- User registration and authentication
- Quiz sessions with multiple-choice questions
- Admin panel for managing questions and users
- Secure token-based authentication
- MongoDB database integration

## Installation

### Prerequisites
- Node.js (18.x, 20.x, or 22.x recommended)
- MongoDB (local or cloud-based)

### Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/HaykuhiMk/PyQuiz.git
   cd PyQuiz
   ```

2. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the `backend` directory and configure your MongoDB connection and authentication secrets.
   ```
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_secret_key
   ```

4. Start the backend server:
   ```bash
   npm start
   ```

5. Install frontend dependencies:
   ```bash
   cd ../frontend
   npm install
   ```

6. Start the frontend server:
   ```bash
   npm start
   ```

## Usage

- Access the quiz interface at `http://localhost:3000` (or your configured port).
- Admins can log in to manage questions and users.
- Users can register, log in, and take quizzes.

## Contributing

Feel free to fork this repository and submit pull requests for improvements.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

