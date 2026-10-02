/** RFC 4180: quote a cell when it holds a comma, quote or line break; double inner quotes. */
export const csvCell = (value: string): string => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

/** A leading =, +, -, @, tab or CR makes spreadsheets run the cell as a formula; prefix such text with an apostrophe. */
export const safeText = (value: string): string => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value)

/** Rows to CSV text with CRLF line ends, as Excel expects. */
export const toCsv = (rows: string[][]): string => rows.map(row => row.map(csvCell).join(',')).join('\r\n')

/** Byte order mark: tells Excel the file is UTF-8, so accented names survive. */
const BOM = '﻿'

/** Hands the browser a CSV file to save. */
export const downloadCsv = (name: string, csv: string) => {
  const url = URL.createObjectURL(new Blob([BOM, csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')

  link.href = url
  link.download = name
  link.click()

  // Revoking in the same tick can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
