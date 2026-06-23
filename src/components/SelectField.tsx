import { memo } from "react";
import { Label } from "./ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";
import { cn } from "@/lib/utils";

const SelectField = memo(
  ({
    id,
    label,
    value,
    onChange,
    options,
    required = false,
    className,
    triggerClassName,
  }: {
    id: string;
    label?: string;
    value: string;
    onChange: (val: string) => void;
    options: { label: string; value: string }[];
    required?: boolean;
    className?: string;
    triggerClassName?: string;
  }) => (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} required={required}>
        <SelectTrigger id={id} className={triggerClassName}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
);

export default SelectField;
