import { appTitle } from '../styles/theme.generated';
import { Logo } from './logo';

export const UnsupportedScreen = () => (
  <div className="unsupported-screen">
    <Logo className="unsupported-screen__logo" />
    <h1 className="unsupported-screen__title">Desktop only</h1>
    <p className="unsupported-screen__body">
      {appTitle} needs a tablet or larger display. Please reopen on a wider
      screen.
    </p>
  </div>
);
