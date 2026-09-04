import { requireSuperadmin } from '../../lib/superadmin'
import { getContentTotals, getFamiliesTable, getRecordsCreatedByMonth } from '../../lib/adminStats'
import AdminClient from '../../components/AdminClient'

// Operator dashboard — superadmin only, always fresh. See plans/admin-menu-dd.md.
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  await requireSuperadmin()

  const [recordsByMonth, totals, families] = await Promise.all([
    getRecordsCreatedByMonth(),
    getContentTotals(),
    getFamiliesTable(),
  ])

  return <AdminClient recordsByMonth={recordsByMonth} totals={totals} families={families} />
}
