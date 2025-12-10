import { Router, type Router as IRouter } from 'express';
import { authLogin } from '../controllers/login.controller';

const router: IRouter = Router();

router.post('/', authLogin);

export default router;