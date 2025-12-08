import { Request, Response } from 'express';
import { getAllRestaurants } from '../../../packages/db/src/project_filter/resturant';
import prisma from '../../../packages/db/src/client';

export async function resturantList(req: Request, res: Response) {
    try {
        const result = await getAllRestaurants(prisma, true);
        
        if (result.success) {
            res.json({
                success: true,
                data: result.restaurants,
                totalCount: result.totalCount
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('Error in resturantList:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch restaurants'
        });
    }
}