import { requireAdmin } from "@/lib/auth";
import { getProfile } from "@/lib/db";
import { ProfileForm } from "@/components/admin-forms";
export default async function Profile() {
  await requireAdmin();
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">PROFILE / 个人资料</p>
          <h1>给网站添上你的印记。</h1>
          <p>这些内容将显示在首页、关于页和联系区域。</p>
        </div>
      </div>
      <ProfileForm profile={await getProfile()} />
    </>
  );
}
