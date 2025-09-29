import React, { useState, useEffect } from "react"
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Trash2 } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { format } from "date-fns"
import { ja } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface DatePickerWithYearMonthProps {
  selected?: Date
  onSelect: (date: Date | undefined) => void
  disabled?: (date: Date) => boolean
  minYear?: number
  maxYear?: number
  className?: string
}

export function DatePickerWithYearMonth({
  selected,
  onSelect,
  disabled,
  minYear = 1900,
  maxYear = new Date().getFullYear(),
  className
}: DatePickerWithYearMonthProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    if (selected) return selected
    return new Date()
  })

  // 年と月の配列を生成
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i)
  const months = [
    { value: 0, label: "1月" },
    { value: 1, label: "2月" },
    { value: 2, label: "3月" },
    { value: 3, label: "4月" },
    { value: 4, label: "5月" },
    { value: 5, label: "6月" },
    { value: 6, label: "7月" },
    { value: 7, label: "8月" },
    { value: 8, label: "9月" },
    { value: 9, label: "10月" },
    { value: 10, label: "11月" },
    { value: 11, label: "12月" },
  ]

  useEffect(() => {
    if (selected) {
      setCurrentMonth(selected)
    }
  }, [selected])

  const handleYearChange = (yearString: string) => {
    const year = parseInt(yearString)
    const newDate = new Date(currentMonth)
    newDate.setFullYear(year)
    setCurrentMonth(newDate)
  }

  const handleMonthChange = (monthString: string) => {
    const month = parseInt(monthString)
    const newDate = new Date(currentMonth)
    newDate.setMonth(month)
    setCurrentMonth(newDate)
  }

  const handleTodayClick = () => {
    const today = new Date()
    setCurrentMonth(today)
    onSelect(today)
  }

  const handleClearClick = () => {
    onSelect(undefined)
  }

  const goToPreviousMonth = () => {
    const newDate = new Date(currentMonth)
    newDate.setMonth(newDate.getMonth() - 1)
    setCurrentMonth(newDate)
  }

  const goToNextMonth = () => {
    const newDate = new Date(currentMonth)
    newDate.setMonth(newDate.getMonth() + 1)
    setCurrentMonth(newDate)
  }

  return (
    <div className={cn("p-3 bg-background border rounded-md shadow-sm", className)}>
      {/* 年月選択ヘッダー */}
      <div className="flex items-center justify-between mb-3 space-x-2">
        <div className="flex items-center space-x-2">
          <Select
            value={currentMonth.getFullYear().toString()}
            onValueChange={handleYearChange}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}年
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={currentMonth.getMonth().toString()}
            onValueChange={handleMonthChange}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((month) => (
                <SelectItem key={month.value} value={month.value.toString()}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-1">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPreviousMonth}
            className="h-7 w-7 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextMonth}
            className="h-7 w-7 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* カレンダーグリッド */}
      <DayPicker
        mode="single"
        selected={selected}
        onSelect={onSelect}
        month={currentMonth}
        onMonthChange={setCurrentMonth}
        disabled={disabled}
        locale={ja}
        showOutsideDays={true}
        className="w-full"
        classNames={{
          months: "flex flex-col space-y-4",
          month: "space-y-4",
          caption: "hidden", // ヘッダーは独自実装のため非表示
          table: "w-full border-collapse space-y-1",
          head_row: "flex",
          head_cell: "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem] flex-1 text-center",
          row: "flex w-full mt-2",
          cell: "h-8 w-8 text-center text-sm p-0 relative flex-1 [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
          day: "h-8 w-8 p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground rounded-md",
          day_range_end: "day-range-end",
          day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
          day_today: "bg-accent text-accent-foreground font-semibold",
          day_outside: "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
          day_disabled: "text-muted-foreground opacity-50",
          day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
          day_hidden: "invisible",
        }}
      />

      {/* 操作ボタン */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearClick}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          削除
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleTodayClick}
          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
        >
          <CalendarIcon className="h-3 w-3 mr-1" />
          今日
        </Button>
      </div>

      {/* 選択された日付の表示 */}
      {selected && (
        <div className="mt-2 text-center text-sm text-muted-foreground">
          選択: {format(selected, "yyyy年MM月dd日", { locale: ja })}
        </div>
      )}
    </div>
  )
}