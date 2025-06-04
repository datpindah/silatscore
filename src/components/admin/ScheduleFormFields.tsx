import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FormFieldProps {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  required?: boolean;
  className?: string;
  options?: { value: string; label: string }[]; // For select
  as?: 'input' | 'textarea' | 'select';
  onSelectChange?: (value: string) => void; // For select
}

export function FormField({ id, label, type = "text", placeholder, value, onChange, required = false, className, as = 'input', options, onSelectChange }: FormFieldProps) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="block text-sm font-medium font-headline mb-1">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {as === 'input' && (
        <Input
          id={id}
          name={id}
          type={type}
          placeholder={placeholder || label}
          value={value}
          onChange={onChange}
          required={required}
          className="bg-background/80"
        />
      )}
      {as === 'textarea' && (
         <Textarea
          id={id}
          name={id}
          placeholder={placeholder || label}
          value={String(value)}
          onChange={onChange}
          required={required}
          rows={3}
          className="bg-background/80"
        />
      )}
      {as === 'select' && options && (
        <Select onValueChange={onSelectChange} value={String(value)}>
          <SelectTrigger id={id} className="bg-background/80">
            <SelectValue placeholder={placeholder || `Pilih ${label}`} />
          </SelectTrigger>
          <SelectContent>
            {options.map(option => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
