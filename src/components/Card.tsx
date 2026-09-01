type CardProps = Readonly<{
  children: React.ReactNode;
  className?: string;
}>;

function Card({ children, className }: CardProps) {
  return (
    <article
      className={`overflow-hidden bg-white rounded shadow-md text-slate-500 shadow-slate-200 p-4 ${className || ''}`}
    >
      {children}
    </article>
  );
}

export default Card;
