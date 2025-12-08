import { Request, Response } from 'express';
import { getReservationsByRestaurantId } from '../../../packages/db/src/project_filter/reservation';
import prisma from '../../../packages/db/src/client';

export async function reservationList(req: Request, res: Response) {
    try {
        // Extract restaurant ID from route parameters
        const restaurantId = parseInt(req.params.id, 10);
        
        if (isNaN(restaurantId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid restaurant ID. Must be a number.'
            });
        }

        // Extract optional query parameters
        const status = req.query.status as string | undefined;
        const fromDate = req.query.fromDate ? new Date(req.query.fromDate as string) : undefined;
        const toDate = req.query.toDate ? new Date(req.query.toDate as string) : undefined;
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

        const result = await getReservationsByRestaurantId(
            prisma,
            restaurantId,
            true, // includeRelations
            {
                ...(status && { status }),
                ...(fromDate && { fromDate }),
                ...(toDate && { toDate }),
                ...(limit && { limit }),
                ...(offset && { offset }),
            }
        );
        
        if (result.success) {
            res.json({
                success: true,
                data: result.reservations,
                totalCount: result.totalCount
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('Error in reservationList:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch reservations'
        });
    }
}

