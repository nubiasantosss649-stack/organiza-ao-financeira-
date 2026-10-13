"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

/** Botão de envio que pede confirmação antes de ações destrutivas. */
export function ConfirmButton({
  message,
  ...props
}: ComponentProps<typeof Button> & { message: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      {...props}
    />
  );
}
