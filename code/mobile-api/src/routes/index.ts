import { Router, type Router as IRouter } from 'express';
import restaurantsRoute from './restaurants.route';
import reservationsRoute from './reservations.route';
import customerRoute from './customer.route';


const router: IRouter = Router();
router.use('/restaurants', restaurantsRoute);
router.use('/reservations', reservationsRoute);
router.use('/customer', customerRoute);
export default router;