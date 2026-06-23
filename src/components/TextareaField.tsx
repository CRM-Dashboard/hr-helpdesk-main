import { memo } from "react";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

const TextareaField = memo(
  ({
    id,
    label,
    value,
    onChange,
    placeholder,
    rows = 3,
    maxLength = 250,
    required = false,
  }: {
    id: string;
    label: string;
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    rows?: number;
    maxLength?: number;
    required?: boolean;
  }) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => {
          if (e.target.value.length <= maxLength) {
            onChange(e.target.value);
          }
        }}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        required={required}
      />
      <p className="text-xs text-slate-500 text-right">
        {value.length}/{maxLength} characters
      </p>
    </div>
  )
);

export default TextareaField;
