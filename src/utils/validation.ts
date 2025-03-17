import { utils } from 'ethers';

export const validateAddress = (address: string): boolean => {
  try {
    return utils.isAddress(address);
  } catch {
    return false;
  }
};

export const validateTag = (tag: string): boolean => {
  const validTags = ['Me', 'Whale', 'Friend', 'Other'];
  return validTags.includes(tag);
};

export const validateNickname = (nickname: string): boolean => {
  return nickname.length <= 20 && /^[a-zA-Z0-9-_\s]+$/.test(nickname);
};

export const sanitizeString = (str: string): string => {
  return str.replace(/[<>]/g, '').trim();
}; 