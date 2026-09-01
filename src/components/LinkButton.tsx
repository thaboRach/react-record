import { CloudDownload } from 'lucide-react';
import React from 'react';

type LinkButtonProps = Readonly<{
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}>;

export default function LinkButton({
  children,
  onClick,
  disabled,
}: LinkButtonProps) {
  return (
    <button
      className="group inline-flex cursor-pointer h-10 items-center justify-center gap-2 justify-self-center whitespace-nowrap rounded px-5 text-sm font-medium tracking-wide text-indigo-500 transition duration-300 hover:bg-indigo-50 hover:text-indigo-600 focus:bg-indigo-100 focus:text-indigo-700 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-indigo-300 disabled:shadow-none disabled:hover:bg-transparent"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="order-2">{children}</span>
      <span className="relative only:-mx-5">
        <CloudDownload
          className={`${disabled ? 'text-indigo-300' : 'text-indigo-500'}`}
        />
      </span>
    </button>
  );
}
