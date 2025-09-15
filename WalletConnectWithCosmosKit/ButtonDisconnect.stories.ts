import type { Meta, StoryObj } from '@storybook/react';
import { ButtonDisconnect } from "./ButtonDisconnect"

const meta = {
  title: 'Components/Wallet Connect',
  component: ButtonDisconnect,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'nav',
    },
  },
  args: {},
} satisfies Meta<typeof ButtonDisconnect>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Disconnect: Story = {};
