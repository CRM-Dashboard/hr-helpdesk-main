import { memo } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const InputField = memo(
  ({
    id,
    label,
    value,
    onChange,
    placeholder,
    type = "text",
    required = false,
  }: {
    id: string;
    label: string;
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    type?: string;
    required?: boolean;
  }) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  )
);

export default InputField;
