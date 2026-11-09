import React, { useRef, useState } from 'react';
import { UploadCloud, FolderOpen } from 'lucide-react';
import { Button } from './Button.tsx';

export interface DropzoneProps {
  onFileSelect?: (file: File) => void;
  onChooseFromAssets?: () => void;
  accept?: string;
  maxSizeMb?: number;
  label?: string;
  caption?: string;
  className?: string;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  onFileSelect,
  onChooseFromAssets,
  accept = 'image/*,video/*',
  maxSizeMb = 25,
  label = 'Upload media',
  caption = `Drag and drop images (up to ${maxSizeMb} MB) or videos (up to 500 MB)`,
  className = '',
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect?.(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect?.(e.target.files[0]);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col items-center justify-center p-8 bg-[var(--bg-2)] rounded-[var(--radius-modals)] border-[1.5px] border-dashed transition-all duration-150 text-center ${
        isDragOver
          ? 'border-[var(--accent)] bg-[var(--bg-3)]'
          : 'border-[var(--border-strong)] hover:border-[var(--text-tertiary)]'
      } ${className}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
      <div className="w-12 h-12 rounded-full bg-[var(--bg-3)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent)] mb-3">
        <UploadCloud size={24} strokeWidth={1.75} />
      </div>

      <h3 className="type-h3 text-[var(--text-primary)] mb-1">{label}</h3>
      <p className="type-caption text-[var(--text-secondary)] max-w-sm mb-5">{caption}</p>

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size={32}
          icon={<UploadCloud size={16} strokeWidth={1.75} />}
          onClick={() => inputRef.current?.click()}
        >
          Upload
        </Button>
        {onChooseFromAssets && (
          <Button
            variant="secondary"
            size={32}
            icon={<FolderOpen size={16} strokeWidth={1.75} />}
            onClick={onChooseFromAssets}
          >
            Choose from Assets
          </Button>
        )}
      </div>
    </div>
  );
};
