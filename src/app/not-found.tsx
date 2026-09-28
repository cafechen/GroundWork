import Link from "next/link";
export default function NotFound() {
  return (
    <p>
      页面不存在 / Page not found. <Link href="/">返回总览 / Overview</Link>
    </p>
  );
}
