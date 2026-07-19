// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConfigSettingRow } from '../config-setting-row';

describe('ConfigSettingRow', () => {
  it('renders the title, description, and control', () => {
    render(
      <ConfigSettingRow title="Availability" description="Who can open it.">
        <button type="button">control</button>
      </ConfigSettingRow>,
    );
    expect(screen.getByRole('heading', { name: 'Availability' })).toBeTruthy();
    expect(screen.getByText('Who can open it.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'control' })).toBeTruthy();
  });
});
