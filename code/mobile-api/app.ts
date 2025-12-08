import express, { type Express } from 'express';
import routes from './src/routes';

const app: Express = express();

// Middleware to parse JSON request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', routes);
export default app;