import { useId, useState } from 'react';
import { CloudUpload, MicAudioLines, type LucideIcon } from 'lucide-react';

export type ButtonSwitchItem<T extends string = string> = Readonly<{
  value: T;
  label: string;
  icon?: LucideIcon;
}>;

const defaultItems = [
  { value: 's3', label: 'S3 multipart upload', icon: CloudUpload },
  { value: 'streaming', label: 'Streaming', icon: MicAudioLines },
] as const satisfies readonly ButtonSwitchItem[];

type ButtonSwitchProps<T extends string> = Readonly<{
  items?: readonly ButtonSwitchItem<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  className?: string;
}>;

function ButtonSwitch<T extends string = string>({
  value,
  defaultValue,
  onChange,
  className,
  items,
}: ButtonSwitchProps<T>) {
  const switchId = useId();
  const switchItems =
    items ?? (defaultItems as unknown as readonly ButtonSwitchItem<T>[]);
  const [internalValue, setInternalValue] = useState<T | undefined>(
    value ?? defaultValue ?? switchItems[0]?.value
  );
  const selectedValue = value ?? internalValue;

  const handleItemClick = (itemValue: T) => {
    setInternalValue(itemValue);
    onChange?.(itemValue);
  };

  return (
    <fieldset
      className={`inline-flex items-center rounded group bg-slate-100 ${className ?? ''}`}
      role="group"
      aria-label="Recording mode"
    >
      {switchItems.map((item) => {
        const isSelected = item.value === selectedValue;
        const Icon = item.icon;

        return (
          <button
            className={`inline-flex items-center justify-center order-1 h-8 gap-2 px-4 text-xs font-medium tracking-wide transition-colors rounded cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
              isSelected
                ? 'text-white bg-indigo-500 hover:bg-indigo-600'
                : 'bg-transparent text-slate-500 hover:text-slate-600'
            }`}
            key={`${switchId}-${item.value}`}
            type="button"
            aria-pressed={isSelected}
            onClick={() => handleItemClick(item.value)}
          >
            {Icon && <Icon className="w-4 h-4" stroke="currentColor" />}
            {item.label}
          </button>
        );
      })}
    </fieldset>
  );
}

export default ButtonSwitch;
