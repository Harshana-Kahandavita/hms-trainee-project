import { Router, type Router as IRouter } from 'express';
import restaurantsRoute from './restaurants.route';
import reservationsRoute from './reservations.route';
import customerRoute from './customer.route';
import authRoute from './auth';

const router: IRouter = Router();
router.use('/restaurants', restaurantsRoute);
router.use('/reservations', reservationsRoute);
router.use('/customer', customerRoute);
router.use('/auth', authRoute);
export default router;