import { describe, it, expect } from "vitest";
import {
  findAccount,
  validateSignup,
  SEED_ACCOUNTS,
  type SignupForm,
} from "../src/auth";

const ok: SignupForm = {
  name: "Sam Lee",
  email: "sam.lee@university.edu",
  username: "samlee",
  role: "Tutor",
  password: "secret123",
  confirm: "secret123",
};

describe("findAccount", () => {
  it("matches username or email case-insensitively", () => {
    expect(findAccount("DEMO", "demo1234", SEED_ACCOUNTS)?.username).toBe(
      "demo",
    );
    expect(
      findAccount(" j.smith@university.edu ", "password1", SEED_ACCOUNTS)
        ?.username,
    ).toBe("jsmith");
  });
  it("rejects wrong password or unknown user", () => {
    expect(findAccount("demo", "nope", SEED_ACCOUNTS)).toBeNull();
    expect(findAccount("ghost", "demo1234", SEED_ACCOUNTS)).toBeNull();
  });
});

describe("validateSignup", () => {
  it("accepts a valid form", () => {
    expect(validateSignup(ok, SEED_ACCOUNTS)).toEqual({});
  });
  it("flags every missing field", () => {
    const e = validateSignup(
      {
        name: "",
        email: "",
        username: "",
        role: "",
        password: "",
        confirm: "",
      },
      SEED_ACCOUNTS,
    );
    expect(Object.keys(e).sort()).toEqual([
      "confirm",
      "email",
      "name",
      "password",
      "role",
      "username",
    ]);
  });
  it("rejects duplicates, weak passwords and mismatches", () => {
    const e = validateSignup(
      {
        ...ok,
        email: "DEMO@example.edu",
        username: "JSmith",
        password: "abcdefgh",
        confirm: "x",
      },
      SEED_ACCOUNTS,
    );
    expect(e.email).toMatch(/already exists/);
    expect(e.username).toMatch(/taken/);
    expect(e.password).toMatch(/number/);
    expect(e.confirm).toMatch(/match/);
  });
});
