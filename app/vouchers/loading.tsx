import Spinner from '../../components/Spinner'

export default function Loading() {
  return (
    <div className="vouchers-loading flex-1 flex items-center justify-center">
      <Spinner className="w-8 h-8 text-emerald-500" />
    </div>
  )
}
