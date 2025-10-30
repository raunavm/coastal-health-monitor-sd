// Data adapter interface for swappable storage backends

export type Adapter = {
  listBeaches(): Promise<any[]>
  getMetrics(): Promise<any>
  listReports(): Promise<any[]>
  addReport(r: any): Promise<any>
  moderate(id: string, action: "approve" | "reject"): Promise<void>
}
