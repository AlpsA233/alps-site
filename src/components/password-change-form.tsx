"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { changePasswordAction, type ActionState } from "@/lib/actions";

function PasswordInput({
  name,
  label,
  minLength,
  autoComplete,
  hint,
  pending,
}: {
  name: "currentPassword" | "newPassword" | "confirmPassword";
  label: string;
  minLength: number;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  pending: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const id = `security-${name}`;
  const hintId = `${id}-hint`;

  return (
    <div className="password-change-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={256}
          aria-describedby={hint ? hintId : undefined}
          readOnly={pending}
          required
        />
        <button
          type="button"
          aria-label={`${visible ? "隐藏" : "显示"}${label}`}
          aria-controls={id}
          aria-pressed={visible}
          disabled={pending}
          onClick={() => setVisible((previous) => !previous)}
        >
          {visible ? (
            <EyeOff size={19} aria-hidden="true" />
          ) : (
            <Eye size={19} aria-hidden="true" />
          )}
        </button>
      </div>
      {hint && (
        <p className="password-field-hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function PasswordChangeForm() {
  const initialState: ActionState = {};
  const [state, action, pending] = useActionState(
    changePasswordAction,
    initialState,
  );

  return (
    <form
      action={action}
      className="form-panel password-change-form"
      aria-busy={pending}
    >
      <h2>修改密码</h2>
      <PasswordInput
        name="currentPassword"
        label="当前密码"
        minLength={1}
        autoComplete="current-password"
        pending={pending}
      />
      <PasswordInput
        name="newPassword"
        label="新密码"
        minLength={12}
        autoComplete="new-password"
        hint="12–256 个字符，可使用字母、数字或符号。"
        pending={pending}
      />
      <PasswordInput
        name="confirmPassword"
        label="再次输入新密码"
        minLength={12}
        autoComplete="new-password"
        pending={pending}
      />
      <div aria-live="polite">
        {state.error && (
          <p role="alert" className="form-message message-error">
            {state.error}
          </p>
        )}
        {state.success && (
          <p role="status" className="form-message message-success">
            {state.success}
          </p>
        )}
      </div>
      <button
        type="submit"
        className="button button-dark password-change-submit"
        disabled={pending}
      >
        <KeyRound size={17} aria-hidden="true" />
        {pending ? "正在修改…" : "修改密码并重新登录"}
      </button>
    </form>
  );
}
