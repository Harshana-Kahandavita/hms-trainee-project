import type { Prisma, PrismaClient } from '../../prisma/generated/prisma'
import {
  TableSetStatus,
  TableSlotStatus
} from '../../prisma/generated/prisma'
import type { QueryResult } from '../types'
import type {
  ReleaseMergedTableSlotsParams,
  ReleaseSingleTableSlotParams
} from './types'

function getClient(prisma: PrismaClient, tx?: Prisma.TransactionClient) {
  return tx ?? prisma
}

export class TableMergeOperations {
  constructor(private readonly prisma: PrismaClient) {}

  async releaseSingleSlot(
    params: ReleaseSingleTableSlotParams,
    tx?: Prisma.TransactionClient
  ): Promise<QueryResult<{ slotId: number }>> {
    if (!params.slotId) {
      return {
        success: false,
        error: {
          code: 'SLOT_NOT_ASSIGNED',
          message: 'Reservation does not have an assigned table slot to release.'
        }
      }
    }

    try {
      const client = getClient(this.prisma, tx)

      await client.tableAvailabilitySlot.update({
        where: { id: params.slotId },
        data: {
          status: TableSlotStatus.AVAILABLE,
          reservationId: null,
          holdExpiresAt: null
        }
      })

      await client.reservationTableAssignment.deleteMany({
        where: { reservationId: params.reservationId }
      })

      await client.reservationTableHold.deleteMany({
        where: { slotId: params.slotId }
      })

      return {
        success: true,
        data: { slotId: params.slotId }
      }
    } catch (error) {
      console.error('❌ Failed to release single table slot:', error)
      return {
        success: false,
        error: {
          code: 'SINGLE_SLOT_RELEASE_FAILED',
          message: 'Unable to release table slot during cancellation.'
        }
      }
    }
  }

  async dissolveActiveSet(
    params: ReleaseMergedTableSlotsParams,
    tx?: Prisma.TransactionClient
  ): Promise<QueryResult<{ tableSetId: number; slotIds: number[] }>> {
    const tableSet = params.tableSet

    if (!tableSet || tableSet.slotIds.length === 0) {
      return {
        success: false,
        error: {
          code: 'TABLE_SET_NOT_FOUND',
          message: 'Active table set missing required slot information.'
        }
      }
    }

    try {
      const client = getClient(this.prisma, tx)
      const updates: Array<Promise<unknown>> = []

      for (const slotId of tableSet.slotIds) {
        const status = tableSet.originalStatuses[slotId] ?? TableSlotStatus.AVAILABLE
        updates.push(
          client.tableAvailabilitySlot.update({
            where: { id: slotId },
            data: {
              status,
              reservationId: null,
              holdExpiresAt: null
            }
          })
        )
      }

      await Promise.all(updates)

      await client.reservationTableAssignment.deleteMany({
        where: { reservationId: params.reservationId }
      })

      await client.tableSet.update({
        where: { id: tableSet.id },
        data: {
          status: TableSetStatus.DISSOLVED,
          dissolvedAt: new Date(),
          dissolvedBy: params.dissolvedBy,
          expiresAt: null
        }
      })

      return {
        success: true,
        data: {
          tableSetId: tableSet.id,
          slotIds: tableSet.slotIds
        }
      }
    } catch (error) {
      console.error('❌ Failed to dissolve active table set during cancellation:', error)
      return {
        success: false,
        error: {
          code: 'TABLE_SET_DISSOLVE_FAILED',
          message: 'Unable to dissolve merged tables during cancellation.'
        }
      }
    }
  }
}
