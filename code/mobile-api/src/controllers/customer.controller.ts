import { Request, Response } from 'express';
import { getCustomerById,  updateCustomerEmailAddress as updateCustomerEmail} from '../../../packages/db/src/project_filter/customer';
import prisma from '../../../packages/db/src/client';
import { isAdmin } from '../utils/userContext';

export async function findCustomerById(req: Request, res: Response) {
    try {
        // Extract customer ID from route parameters
        const customerId = parseInt(req.params.id, 10);
        
        if (isNaN(customerId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid customer ID. Must be a number.'
            });
        }

        // Check if user is admin before returning response
        if (!isAdmin(req)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin role required to access customer data.'
            });
        }

        const result = await getCustomerById(prisma, customerId);
        
        if (result.success) {
            res.json({
                success: true,
                data: result.customer
            });
        } else {
            res.status(404).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('Error in findCustomerById:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch customer'
        });
    }
}


export async function updateCustomerEmailAddress(req: Request, res: Response) {
    try {
        const customerId = parseInt(req.params.id, 10);
        
        if (isNaN(customerId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid customer ID. Must be a number.'
            });
        }

        // Check if user is admin before allowing update
        if (!isAdmin(req)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin role required to update customer data.'
            });
        }

        // Extract email address from request body
        // Handle case where req.body might be undefined (shouldn't happen with middleware, but safe check)
        const emailAddress = req.body?.emailAddress;
        
        // Validate email address (can be null to clear email, or a valid email string)
        if (emailAddress !== undefined && emailAddress !== null && typeof emailAddress !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Invalid email address. Must be a string or null.'
            });
        }

        // Call the update function
        const result = await updateCustomerEmail(prisma, customerId, emailAddress || null);
        
        if (result.success) {
            res.json({
                success: true,
                data: result.customer,
                message: 'Customer email address updated successfully'
            });
        } else {
            // Determine appropriate status code based on error
            const statusCode = result.error.includes('not found') ? 404 : 
                             result.error.includes('already in use') ? 409 : 
                             result.error.includes('Invalid email') ? 400 : 500;
            
            res.status(statusCode).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('Error in updateCustomerEmailAddress:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update customer email address'
        });
    }
}