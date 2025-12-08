import { Router, type Router as IRouter } from 'express';
import { resturantList } from '../controllers/restaurants.controller';



const router: IRouter = Router();

// Public routes (authentication optional)
// Note: Order matters - specific routes must come before parameterized routes
router.get('/', resturantList); 
export default router;