import { Router, type Router as IRouter } from 'express';
import { findCustomerById, updateCustomerEmailAddress } from '../controllers/customer.controller';
import { authMiddleware } from '../utils/tokenValidator';

const router: IRouter = Router();

// Apply token validation middleware to all customer routes
router.use(authMiddleware);

router.get('/:id', findCustomerById);
router.put('/:id/email', updateCustomerEmailAddress);

export default router;