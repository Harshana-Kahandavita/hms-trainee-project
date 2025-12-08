import { Router, type Router as IRouter } from 'express';
import { findCustomerById, updateCustomerEmailAddress } from '../controllers/customer.controller';



const router: IRouter = Router();

router.get('/:id', findCustomerById);
router.put('/:id/email', updateCustomerEmailAddress);

export default router;