import { Legal } from "@/components/legal";
export const metadata = { title: "Privacy" };
export default function Privacy() {
  return (
    <Legal title="Privacy">
      <p>This page explains what we collect when you join the Mila waitlist and what we do with it.</p>
      <h2>What we collect</h2>
      <ul><li>Your email address and, if you give it, your first name.</li><li>Which link you came from (for example Instagram or X), so we know what is working.</li></ul>
      <h2>How we use it</h2>
      <ul><li>To send you a confirmation and your personal launch link.</li><li>To tell you about Mila&apos;s launch and early updates.</li></ul>
      <p>We do not sell your information and we do not share it with advertisers.</p>
      <h2>Who handles it</h2>
      <p>Your details are stored with our database and email providers, who process them for us only to run the waitlist.</p>
      <h2>Your choices</h2>
      <p>Reply to any email from us, or write to milarealestateapp@yahoo.com, and we will remove you from the waitlist or delete your details.</p>
      <h2>Contact</h2>
      <p>milarealestateapp@yahoo.com</p>
    </Legal>
  );
}
