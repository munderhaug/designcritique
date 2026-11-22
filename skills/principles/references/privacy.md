# Permissions and privacy

Sources: Apple, Human Interface Guidelines, "Privacy" and "Requesting permission" (ask when the
person does the thing that needs it, and say why); Google, Android Developers, "Request runtime
permissions" and Material Design's permissions guidance (the same, and the app works when the
answer is no); Ann Cavoukian, "Privacy by Design: The 7 Foundational Principles" (Information
and Privacy Commissioner of Ontario, 2009): privacy as the default setting; Regulation (EU)
2016/679 (GDPR), Article 5(1)(c), data minimisation. Deceptive consent patterns are `ETHICS-*`.

| ID | Principle | Look for |
|---|---|---|
| `PRIV-IN-CONTEXT` | Ask for a permission at the moment it is needed, not at first launch (HIG; Android) | Location, notifications, contacts or camera requested on the first screen, before the person has done anything that needs them |
| `PRIV-EXPLAIN` | Say what it is for, in the person's terms, before the system prompt (HIG; Android) | A bare system dialog; a reason that describes the app's benefit, not the person's |
| `PRIV-WORKS-WITHOUT` | Declining leaves the app usable, with a way back to the choice (Android; HIG) | A dead end after "Don't allow"; a feature that silently stops working |
| `PRIV-MINIMUM` | Ask only for the data the task needs (GDPR Art. 5(1)(c)) | Sign-up fields the task doesn't use; precise location where a city would do |
| `PRIV-DEFAULT` | The private choice is the default; sharing is something the person turns on (Cavoukian) | Sharing, tracking or visibility on by default |
