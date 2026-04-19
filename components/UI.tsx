import React, { ReactNode } from 'react';
import { LucideIcon, X } from 'lucide-react';

// --- Button ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  isLoading?: boolean;
  icon?: ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, variant = 'primary', isLoading, icon, className, ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500  :bg-indigo-600",
    secondary: "bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-400  :bg-emerald-700",
    outline: "border-2 border-slate-200 text-slate-700 hover:border-indigo-500 hover:text-indigo-600 bg-transparent   :text-white :border-indigo-400",
    danger: "bg-red-500 text-white hover:bg-red-600 focus:ring-red-400  :bg-red-700"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className || ''}`} 
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {!isLoading && icon && <span className="mr-2">{icon}</span>}
      {children}
    </button>
  );
};

// --- Input ---
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, error, icon, className, ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-slate-700  mb-1">{label}</label>}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {icon}
          </div>
        )}
        <input
          className={`w-full ${icon ? 'pl-10' : 'px-3'} py-2 bg-white  border rounded-lg shadow-sm placeholder-slate-400  
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
            disabled:bg-slate-50 disabled:text-slate-500 :bg-slate-800
            ${error ? 'border-red-300 text-red-900 focus:ring-red-500 focus:border-red-500  ' : 'border-slate-300 text-slate-900 '}
            ${className || ''}
          `}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-sm text-red-600 ">{error}</p>}
    </div>
  );
};

// --- Card ---
export const Card: React.FC<{ children: ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`bg-white  rounded-xl shadow-sm border border-slate-100  overflow-hidden transition-colors duration-200 ${className || ''}`}>
    {children}
  </div>
);

// --- Header ---
export const Header: React.FC<{ title: string; subtitle?: string; onBack?: () => void }> = ({ title, subtitle, onBack }) => (
  <div className="mb-8">
    {onBack && (
      <button onClick={onBack} className="text-slate-500 hover:text-indigo-600  :text-indigo-400 mb-4 flex items-center text-sm font-medium">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        Back
      </button>
    )}
    <h1 className="text-3xl font-bold text-slate-900 ">{title}</h1>
    {subtitle && <p className="text-slate-500  mt-2">{subtitle}</p>}
  </div>
);

// --- Modal ---
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white  rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100 ">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 ">
          <h3 className="font-bold text-lg text-slate-900 ">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 :bg-slate-700 text-slate-500 ">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 text-slate-700 ">
          {children}
        </div>
      </div>
    </div>
  );
};