type IconButtonProps = Readonly<{
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}>;

function IconButton({ onClick, disabled, children }: IconButtonProps) {
  return (
    <button
      className="inline-flex items-center self-center justify-center h-10 gap-2 px-5 text-sm font-medium tracking-wide text-white transition duration-300 rounded-full focus-visible:outline-none whitespace-nowrap bg-indigo-500 hover:bg-indigo-600 cursor-pointer focus:bg-indigo-700 disabled:cursor-not-allowed disabled:border-indigo-300 disabled:bg-indigo-300 disabled:shadow-none"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default IconButton;
