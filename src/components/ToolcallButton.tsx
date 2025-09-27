import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
};

export default function ToolcallButton({ children, className = "", ...rest }: Props) {
  return (
    <button
      className={
        "px-3 py-2 rounded-sm text-sm text-rose-500 bg-rose-600/10 border border-rose-600/20 " +
        "hover:bg-rose-600/20 transition-colors duration-300 ease-in-out cursor-pointer " +
        "disabled:opacity-50 disabled:cursor-not-allowed " +
        className
      }
      {...rest}
    >
      {children}
    </button>
  );
}


