import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface ComboboxOption {
  value: string
  label: string
  [key: string]: any
}

interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  disabled?: boolean
  filterFn?: (option: ComboboxOption, search: string) => boolean
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "選択してください",
  searchPlaceholder = "検索...",
  emptyText = "見つかりませんでした",
  className,
  disabled = false,
  filterFn,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const selectedOption = options.find((option) => option.value === value)
  
  // 選択された値の表示用ラベル（長い場合は切り詰め）
  const displayLabel = React.useMemo(() => {
    if (!selectedOption) return placeholder
    return selectedOption.label
  }, [selectedOption, placeholder])

  const defaultFilterFn = React.useCallback(
    (option: ComboboxOption, search: string) => {
      // 空文字列の値（"未選択"など）は常に表示
      if (!option.value) return true
      if (!search) return true
      const searchLower = search.toLowerCase()
      return (
        option.value.toLowerCase().includes(searchLower) ||
        option.label.toLowerCase().includes(searchLower)
      )
    },
    []
  )

  const filter = filterFn || defaultFilterFn

  const filteredOptions = React.useMemo(() => {
    return options.filter((option) => filter(option, search))
  }, [options, search, filter])

  // Popoverが開いたときに検索フィールドをクリア
  React.useEffect(() => {
    if (!open) {
      setSearch("")
    }
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          <span className="truncate flex-1 text-left" title={selectedOption?.label}>
            {displayLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[500px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[500px]">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value || "empty"}
                  onSelect={(currentValue) => {
                    const selectedValue = currentValue === "empty" ? "" : currentValue
                    onValueChange?.(selectedValue === value ? "" : selectedValue)
                    setOpen(false)
                    setSearch("")
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      (value || "") === (option.value || "") ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

