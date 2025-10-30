import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { ReportForm } from "@/components/report-form"
import { Button } from "@/components/ui/button"
import { ReportPageTitle } from "@/components/report-page-client"

export default function ReportPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-900">
      {/* Header */}
      <header className="bg-white dark:bg-neutral-950 border-b border-gray-200 dark:border-neutral-800 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <ReportPageTitle />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        <ReportForm />
      </main>
    </div>
  )
}
