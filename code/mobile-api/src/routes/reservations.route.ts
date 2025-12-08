import { Router, type Router as IRouter } from 'express';
import { reservationList } from '../controllers/reservations.controller';



const router: IRouter = Router();

router.get('/:id', reservationList); 

export default router;