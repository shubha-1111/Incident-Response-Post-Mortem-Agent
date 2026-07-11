import React, { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

export interface AttackTypeOption {
  value: string;
  label: string;
  color: string;
}

const ATTACK_TYPES: AttackTypeOption[] = [
  { value: 'ransomware', label: 'Ransomware', color: 'red' },
  { value: 'zero_day', label: 'Zero-Day', color: 'orange' },
  { value: 'apt', label: 'APT', color: 'purple' },
  { value: 'credential_stuffing', label: 'Credential Stuffing', color: 'yellow' },
  { value: 'sql_injection', label: 'SQL Injection', color: 'blue' },
  { value: 'ddos', label: 'DDoS', color: 'green' },
  { value: 'phishing', label: 'Phishing', color: 'pink' },
  { value: 'supply_chain', label: 'Supply Chain', color: 'indigo' },
];

interface MultiSelectFilterProps {
  selected: string[];
  onChange: (selected: string[]) => void;
  options?: AttackTypeOption[];
  placeholder?: string;
}

export function MultiSelectFilter({
  selected,
  onChange,
  options = ATTACK_TYPES,
  placeholder = 'Select attack types...',
}: MultiSelectFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
      >
        <span className="text-sm">
          {selected.length === 0 ? placeholder : `${selected.length} selected`}
        </span>
        <ChevronDown className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-2 bg-slate-900 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-auto">
          {options.map((option) => (
            <div
              key={option.value}
              onClick={() => toggleOption(option.value)}
              className="flex items-center justify-between px-4 py-2 hover:bg-slate-800 cursor-pointer"
            >
              <span className="text-sm text-white">{option.label}</span>
              {selected.includes(option.value) && (
                <X className="w-4 h-4 text-slate-400" />
              )}
            </div>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selected.map((value) => {
            const option = options.find((o) => o.value === value);
            return (
              <span
                key={value}
                className="text-xs px-2 py-1 rounded-full bg-slate-800 text-white flex items-center"
              >
                {option?.label}
                <button
                  type="button"
                  onClick={() => toggleOption(value)}
                  className="ml-1 hover:text-red-400"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MultiSelectFilter;
